#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { SAFETY_BANNER } from "./safety.js";
import { makeRunner } from "./runner.js";
import { makeVerifier } from "./verify.js";

async function main() {
  // Banner goes to stderr so it never corrupts the stdio MCP channel (stdout).
  process.stderr.write(SAFETY_BANNER + "\n");

  const cfg = loadConfig();
  if (cfg.scope.allowedTargets.length === 0) {
    process.stderr.write(
      "[vidence-recon-mcp] WARNING: no authorized targets configured — every tool will refuse until you set scope.allowedTargets.\n",
    );
  }

  if (cfg.verification.required && !cfg.verification.secret) {
    process.stderr.write(
      "[vidence-recon-mcp] WARNING: ownership verification is required but no verification.secret is set — every tool will refuse until you run the 'verify' tool and publish a challenge. Set VIDENCE_RECON_MCP_VERIFY_SECRET.\n",
    );
  }

  const runner = makeRunner(cfg);
  const verifier = makeVerifier(cfg);
  const server = buildServer(cfg, runner, verifier);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Warm up the runner in the BACKGROUND, after the handshake, so a slow first
  // image pull never blocks the client connection. No-op for the local runner.
  void runner.ensureReady().catch((e) =>
    process.stderr.write(`[vidence-recon-mcp] tool-host provisioning error: ${e instanceof Error ? e.message : String(e)}\n`),
  );
}

main().catch((err) => {
  process.stderr.write(`[vidence-recon-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
