import { run as realRun, type ExecResult } from "./exec.js";
import type { Config } from "./config.js";

export interface ExecOpts {
  timeoutMs: number;
  maxBytes: number;
}

/**
 * How a command actually gets executed. The one seam between the server and the
 * environment the tools live in. Two adapters satisfy it:
 *   - LocalRunner : the binary is on PATH (the mode used INSIDE the Kali image).
 *   - DockerRunner: the binary lives in a persistent Kali container, reached via
 *                   `docker exec`, with that container pulled/started on demand.
 *
 * The caller resolves which binary to run and paces the calls; the runner only
 * knows how to execute a command in its environment and how to make that
 * environment ready. Nothing above this seam mentions Docker.
 */
export interface Runner {
  /** Make sure a command *can* run. Local: no-op. Docker: ensure the tool host is up. */
  ensureReady(): Promise<void>;
  /** Run an already-resolved binary with an explicit argv (no shell). */
  exec(binary: string, args: string[], opts: ExecOpts): Promise<ExecResult>;
}

type RunFn = typeof realRun;

export function makeRunner(cfg: Config, run: RunFn = realRun): Runner {
  return cfg.runner.mode === "docker" ? makeDockerRunner(cfg, run) : makeLocalRunner(run);
}

export function makeLocalRunner(run: RunFn = realRun): Runner {
  return {
    ensureReady: async () => {},
    exec: (binary, args, opts) => run(binary, args, opts),
  };
}

const MINUTE = 60_000;

function log(msg: string): void {
  process.stderr.write(`[vidence-recon-mcp] ${msg}\n`);
}

/**
 * Runs tool binaries inside a persistent Kali container via `docker exec`, and
 * owns that container's whole lifecycle. `ensureReady` (in docker mode with
 * autostart) keeps the container on the CURRENT image before tools are used:
 *   1. checks the Docker daemon is reachable;
 *   2. pulls `runner.image` (a fast no-op when already current; only downloads
 *      layers when a newer image was published) — this is the auto-update;
 *   3. reconciles the running container with the freshly-pulled image:
 *        - on the current image, running  → nothing to do
 *        - on the current image, stopped   → `docker start`
 *        - on an OLDER image               → recreate from the new one
 *        - missing                         → create it
 *
 * Offline-safe: if the registry can't be reached, it falls back to the local
 * image / existing container instead of erroring. Concurrent calls collapse
 * into one in-flight run, so a tool call can lazily re-trigger provisioning
 * (e.g. Docker started after the server did) without stacking overlapping pulls.
 */
export function makeDockerRunner(cfg: Config, run: RunFn = realRun): Runner {
  const { dockerPath: docker, container: name, image } = cfg.runner;
  const small = { maxBytes: 256 * 1024 };

  let ready = false;
  let inFlight: Promise<void> | null = null;

  async function provision(): Promise<void> {
    if (!cfg.runner.autostart) return; // operator manages the container themselves

    // 1. Is the Docker daemon reachable?
    const ver = await run(docker, ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000, ...small });
    if (ver.code !== 0) {
      log(`Docker not reachable — is Docker Desktop running? Tools will fail until '${name}' is up. (${(ver.stderr || "").trim()})`);
      return;
    }

    // Snapshot the container (running? built from which image id?) BEFORE pulling.
    const insp = await run(docker, ["inspect", "-f", "{{.State.Running}}|{{.Image}}", name], { timeoutMs: 15_000, ...small });
    const containerExists = insp.code === 0;
    const [runningStr, containerImageId] = containerExists ? insp.stdout.trim().split("|") : ["", ""];
    const containerRunning = runningStr === "true";

    // 2. Check the registry for a newer image and pull it. A fast no-op when
    //    already current; first ever pull is several GB.
    log(`Checking for a newer tool-host image (${image})…`);
    const pull = await run(docker, ["pull", image], { timeoutMs: 20 * MINUTE, ...small });
    if (pull.code !== 0) {
      log(`Registry unreachable (offline?) — using the local image if present. (${(pull.stderr || "").trim()})`);
    } else if (/Downloaded newer image/i.test(pull.stdout)) {
      log(`A newer tool-host image was pulled.`);
    }

    // The image id we WANT the container to be on (local copy after the pull).
    const want = await run(docker, ["inspect", "-f", "{{.Id}}", image], { timeoutMs: 15_000, ...small });
    const desiredImageId = want.code === 0 ? want.stdout.trim() : "";

    if (containerExists) {
      const upToDate = !desiredImageId || containerImageId === desiredImageId;
      if (upToDate) {
        // On the current image (or we couldn't read the id and must trust it).
        // Just make sure it's running.
        if (containerRunning) {
          ready = true;
          return;
        }
        const started = await run(docker, ["start", name], { timeoutMs: MINUTE, ...small });
        ready = started.code === 0;
        log(ready ? `Tool host '${name}' is up.` : `Could not start '${name}': ${(started.stderr || "").trim()}`);
        return;
      }
      // On an OLDER image → recreate from the updated one.
      log(`Tool host '${name}' is on an older image — recreating it from the updated one…`);
      await run(docker, ["rm", "-f", name], { timeoutMs: MINUTE, ...small });
      // fall through to create
    }

    // 3. Create the container. Needs the image locally; if the pull failed AND
    //    it isn't cached, we can't proceed — say so and let a later retry handle it.
    if (!desiredImageId) {
      log(`Tool-host image '${image}' isn't available locally and the registry couldn't be reached. Tools will fail until it can be pulled.`);
      return;
    }
    log(`Creating tool host '${name}' from ${image}…`);
    const created = await run(
      docker,
      [
        "run",
        "-d",
        "--name",
        name,
        "--restart",
        "unless-stopped",
        "--cap-add=NET_RAW",
        "--cap-add=NET_ADMIN",
        "--entrypoint",
        "sleep",
        image,
        "infinity",
      ],
      { timeoutMs: 15 * MINUTE, ...small },
    );
    if (created.code === 0) {
      ready = true;
      log(`Tool host '${name}' is up.`);
    } else {
      log(`Could not create tool host '${name}': ${(created.stderr || created.stdout || "").trim()}`);
    }
  }

  function ensureReady(): Promise<void> {
    if (ready) return Promise.resolve();
    if (!inFlight) {
      inFlight = provision().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  async function exec(binary: string, args: string[], opts: ExecOpts): Promise<ExecResult> {
    const res = await run(docker, ["exec", name, binary, ...args], opts);

    // If the container isn't there (e.g. Docker Desktop started after the server
    // did, the first pull hasn't finished, or the container died later), tell
    // the caller to retry. With autostart on, lazily (re)provision in the
    // background — clearing `ready` first so a container that died AFTER a
    // successful start actually gets recreated instead of short-circuiting.
    if (res.code !== 0) {
      const e = (res.stderr || res.stdout || "").toLowerCase();
      if (e.includes("no such container") || e.includes("is not running") || e.includes("cannot connect to the docker")) {
        let message: string;
        if (cfg.runner.autostart) {
          ready = false; // the container is gone — don't trust the latch
          void ensureReady().catch(() => {});
          message = `The '${name}' tool host isn't ready yet. On first run it pulls a multi-GB Kali image and starts the container, which can take a few minutes. It's being (re)started now — make sure Docker Desktop is running, then retry shortly.`;
        } else {
          message = `The '${name}' tool host isn't running, and autostart is off so this server won't start it. Start it yourself (e.g. \`docker start ${name}\`) or set runner.autostart=true, then retry.`;
        }
        return { stdout: message, stderr: "", code: 0, timedOut: false };
      }
    }
    return res;
  }

  return { ensureReady, exec };
}
