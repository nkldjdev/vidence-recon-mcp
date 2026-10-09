import { run } from "./exec.js";
import type { Config } from "./config.js";

/**
 * In docker mode with autostart, make sure the Kali tool-host container is
 * running before tools are used:
 *   - already running   → nothing to do
 *   - stopped           → `docker start`
 *   - missing           → `docker run -d … <image> sleep infinity` (this
 *                         auto-pulls the image; the first pull is several GB)
 *
 * This runs in the BACKGROUND after the MCP handshake, so a slow first pull
 * never blocks the client connection. Until it finishes, docker-mode tool calls
 * return a friendly "still starting" message (see server.ts).
 */

let ready = false;
export function toolHostReady(): boolean {
  return ready;
}

function log(msg: string): void {
  process.stderr.write(`[vidence-recon-mcp] ${msg}\n`);
}

const MINUTE = 60_000;

export async function ensureToolHost(cfg: Config): Promise<void> {
  if (cfg.runner.mode !== "docker" || !cfg.runner.autostart) {
    ready = cfg.runner.mode === "local";
    return;
  }
  const { dockerPath: docker, container: name, image } = cfg.runner;
  const small = { maxBytes: 64 * 1024 };

  // Is the Docker daemon reachable?
  const ver = await run(docker, ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000, ...small });
  if (ver.code !== 0) {
    log(`Docker not reachable — is Docker Desktop running? Tools will fail until '${name}' is up. (${(ver.stderr || "").trim()})`);
    return;
  }

  // Already there?
  const insp = await run(docker, ["inspect", "-f", "{{.State.Running}}", name], { timeoutMs: 15_000, ...small });
  const state = insp.stdout.trim();
  if (insp.code === 0 && state === "true") {
    ready = true;
    return;
  }
  if (insp.code === 0 && state === "false") {
    log(`Starting tool host '${name}'…`);
    const started = await run(docker, ["start", name], { timeoutMs: MINUTE, ...small });
    ready = started.code === 0;
    log(ready ? `Tool host '${name}' is up.` : `Could not start '${name}': ${(started.stderr || "").trim()}`);
    return;
  }

  // Not present → create it (pulls the image if missing — first time is slow).
  log(`Tool host '${name}' not found. Pulling ${image} (first time is several GB) and starting it… this can take a few minutes.`);
  const created = await run(
    docker,
    ["run", "-d", "--name", name, "--cap-add=NET_RAW", "--cap-add=NET_ADMIN", "--entrypoint", "sleep", image, "infinity"],
    { timeoutMs: 15 * MINUTE, ...small },
  );
  if (created.code === 0) {
    ready = true;
    log(`Tool host '${name}' is up.`);
  } else {
    log(`Could not create tool host '${name}': ${(created.stderr || created.stdout || "").trim()}`);
  }
}
