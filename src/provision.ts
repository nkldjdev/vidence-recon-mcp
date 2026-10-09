import { run } from "./exec.js";
import type { Config } from "./config.js";

/**
 * In docker mode with autostart, make sure the Kali tool-host container is
 * running on the CURRENT image before tools are used. On every startup it:
 *   1. checks the Docker daemon is reachable;
 *   2. pulls `runner.image` (a quick no-op when already current; only downloads
 *      layers when a newer image was published) — this is the auto-update;
 *   3. compares the running container's image to the freshly-pulled one:
 *        - container on the current image, running   → nothing to do
 *        - container on the current image, stopped    → `docker start`
 *        - container on an OLDER image                → recreate it from the new one
 *        - container missing                          → create it
 *
 * The image tag (default `:latest`) is decoupled from the npm package version:
 * the server tracks whatever `:latest` points at, so a rarely-changing image and
 * a frequently-changing package update independently.
 *
 * Offline-safe: if the registry can't be reached, it falls back to the local
 * image / existing container instead of erroring.
 *
 * This runs in the BACKGROUND after the MCP handshake, so a slow first pull
 * never blocks the client connection. Until it finishes, docker-mode tool calls
 * return a friendly "still starting" message (see server.ts).
 */

let ready = false;
let inFlight: Promise<void> | null = null;

export function toolHostReady(): boolean {
  return ready;
}

function log(msg: string): void {
  process.stderr.write(`[vidence-recon-mcp] ${msg}\n`);
}

const MINUTE = 60_000;

/**
 * Run ensureToolHost, but collapse concurrent calls into one in-flight run.
 * Lets tool calls lazily re-trigger provisioning (e.g. if Docker started after
 * the server did) without stacking up overlapping pulls.
 */
export function ensureToolHostOnce(cfg: Config): Promise<void> {
  if (ready) return Promise.resolve();
  if (!inFlight) {
    inFlight = ensureToolHost(cfg).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export async function ensureToolHost(cfg: Config): Promise<void> {
  if (cfg.runner.mode !== "docker" || !cfg.runner.autostart) {
    ready = cfg.runner.mode === "local";
    return;
  }
  const { dockerPath: docker, container: name, image } = cfg.runner;
  const small = { maxBytes: 256 * 1024 };

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

  // 2. Check the registry for a newer image and pull it. `docker pull` is a fast
  //    no-op when already current, and only downloads layers when a newer image
  //    exists. First ever pull is several GB.
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
      // Container is on the current image (or we couldn't read the image id and
      // must trust the existing one). Just make sure it's running.
      if (containerRunning) {
        ready = true;
        return;
      }
      const started = await run(docker, ["start", name], { timeoutMs: MINUTE, ...small });
      ready = started.code === 0;
      log(ready ? `Tool host '${name}' is up.` : `Could not start '${name}': ${(started.stderr || "").trim()}`);
      return;
    }
    // Container is on an OLDER image → recreate from the updated one.
    log(`Tool host '${name}' is on an older image — recreating it from the updated one…`);
    await run(docker, ["rm", "-f", name], { timeoutMs: MINUTE, ...small });
    // fall through to create
  }

  // 3. Create the container. Needs the image locally; if the pull failed AND it
  //    isn't cached, we can't proceed — say so and let a later retry handle it.
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
