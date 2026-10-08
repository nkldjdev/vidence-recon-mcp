export type SafetyLevel = "safe" | "active" | "intrusive";

export const SAFETY_BANNER = `
╭───────────────────────────────────────────────────────────────╮
│  vidence-recon-mcp — AUTHORIZED TESTING ONLY                          │
│                                                                 │
│  By running a tool you assert you own the target or have        │
│  explicit written permission to test it. Unauthorized scanning  │
│  or testing of systems is illegal in most jurisdictions.        │
│  See DISCLAIMER.md. The authors accept no liability.            │
╰───────────────────────────────────────────────────────────────╯
`.trim();

/**
 * Flags that are NEVER permitted via extraArgs on any tool, regardless of
 * config. These turn a detection tool into a destructive / exfiltrating /
 * post-exploitation one — out of scope for this project by design.
 */
export const GLOBAL_BLOCKED_FLAGS = [
  // sqlmap data exfiltration / OS takeover
  "--dump",
  "--dump-all",
  "--os-shell",
  "--os-pwn",
  "--os-cmd",
  "--sql-shell",
  "--file-read",
  "--file-write",
  "--file-dest",
  "--eval",
  // generic shell / command execution escape hatches
  "-e",
  "--exec",
  "--command",
];

export function isTierAllowed(
  level: SafetyLevel,
  cfg: { allowActive: boolean; allowIntrusive: boolean },
): boolean {
  if (level === "safe") return true;
  if (level === "active") return cfg.allowActive;
  return cfg.allowIntrusive;
}

export function tierRefusalMessage(level: SafetyLevel): string {
  if (level === "active")
    return "This tool is tier 'active' and config.safety.allowActive is false.";
  return (
    "This tool is tier 'intrusive'. It is disabled unless config.safety.allowIntrusive is true. " +
    "Enable it only against targets you own and only when you understand it sends more aggressive traffic."
  );
}

/** Reject any extraArgs that collide with the global or per-tool blocklist. */
export function screenExtraArgs(
  extraArgs: string[],
  toolBlocked: string[],
): { ok: true } | { ok: false; offending: string } {
  const blocked = new Set([...GLOBAL_BLOCKED_FLAGS, ...toolBlocked].map((f) => f.toLowerCase()));
  for (const a of extraArgs) {
    const token = a.split("=")[0].toLowerCase();
    if (blocked.has(token)) return { ok: false, offending: a };
  }
  return { ok: true };
}
