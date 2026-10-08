# Contributing to vidence-recon-mcp

Thanks for wanting to help! This project aims to be the **safe, well-documented** MCP server for
authorized security testing. Contributions that keep it that way are very welcome.

## Ground rules

- **Detection, not exploitation.** We accept recon, scanning, and vulnerability *detection*
  tools. We do **not** accept turnkey exploitation / post-exploitation, data-exfiltration flags,
  reverse shells, or third-party credential cracking. See the README "Scope & philosophy".
- **Safety controls are load-bearing.** Any change that touches the scope guard
  (`src/scope.ts`), the exec wrapper (`src/exec.ts`), or the safety model (`src/safety.ts`)
  needs tests and a clear explanation. Never weaken these for convenience.
- Be kind — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Adding a tool

Tools are declarative. Add a `ToolSpec` to [`src/tools/specs.ts`](src/tools/specs.ts):

```ts
{
  name: "my_tool",
  description: "What it does. Note its tier.",
  binary: "mytool",
  binaryKey: "mytool",
  safety: "active",            // safe | active | intrusive
  input: z.object({ target: z.string().describe("...") }),
  targetField: "target",       // which field gets scope-checked
  blockedFlags: ["--dangerous"],
  buildArgs: (i) => ["--flag", String(i.target)],
}
```

Rules:
- **Build args yourself** from structured inputs. Don't accept free-form command strings.
- Pick the right **safety tier**. If it sends aggressive traffic, it's `active`; if it probes
  for exploitable conditions, it's `intrusive`.
- Add any destructive flags the underlying tool supports to `blockedFlags` (the global blocklist
  in `src/safety.ts` already covers the common ones).
- The server handles scope, tiering, timeouts, and arg screening uniformly — you don't repeat it.

## Adding a playbook

Add a `Playbook` to [`src/playbooks.ts`](src/playbooks.ts). Keep the rules-of-engagement footer
(`RULES(...)`) — it is what keeps the model scoped and non-destructive.

## Dev workflow

```bash
npm install
npm run build
npm test
npm run lint
```

Please add a test for any change to the safety-critical files. Open a PR against `main` with a
clear description. CI (lint + build + test) must pass.
