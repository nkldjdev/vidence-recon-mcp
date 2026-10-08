import { readFileSync } from "node:fs";
import { z } from "zod";

const ConfigSchema = z.object({
  scope: z
    .object({
      allowedTargets: z.array(z.string()).default([]),
    })
    .default({}),
  safety: z
    .object({
      allowActive: z.boolean().default(true),
      allowIntrusive: z.boolean().default(false),
      allowRawArgs: z.boolean().default(false),
      minIntervalMs: z.number().int().nonnegative().default(0),
    })
    .default({}),
  limits: z
    .object({
      commandTimeoutSec: z.number().int().positive().default(300),
      maxOutputBytes: z.number().int().positive().default(1024 * 1024),
    })
    .default({}),
  tools: z.record(z.string()).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load config from (in order): $VIDENCE_RECON_MCP_CONFIG, ./config.json.
 * Environment overrides:
 *   VIDENCE_RECON_MCP_ALLOWED_TARGETS=comma,separated,hosts
 *   VIDENCE_RECON_MCP_ALLOW_INTRUSIVE=true
 */
export function loadConfig(): Config {
  const path = process.env.VIDENCE_RECON_MCP_CONFIG || "config.json";
  let raw: unknown = {};
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // No file is fine; env vars or defaults take over. Scope still defaults to empty.
  }

  const cfg = ConfigSchema.parse(raw);

  const envTargets = process.env.VIDENCE_RECON_MCP_ALLOWED_TARGETS;
  if (envTargets) {
    cfg.scope.allowedTargets = envTargets
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (process.env.VIDENCE_RECON_MCP_ALLOW_INTRUSIVE === "true") {
    cfg.safety.allowIntrusive = true;
  }

  return cfg;
}
