#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { SAFETY_BANNER } from "./safety.js";

async function main() {
  // Banner goes to stderr so it never corrupts the stdio MCP channel (stdout).
  process.stderr.write(SAFETY_BANNER + "\n");

  const cfg = loadConfig();
  if (cfg.scope.allowedTargets.length === 0) {
    process.stderr.write(
      "[vidence-recon-mcp] WARNING: no authorized targets configured — every tool will refuse until you set scope.allowedTargets.\n",
    );
  }

  const server = buildServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[vidence-recon-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
