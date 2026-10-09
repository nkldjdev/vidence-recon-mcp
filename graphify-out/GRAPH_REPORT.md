# Graph Report - pentest-mcp-vidence  (2026-10-09)

## Corpus Check
- 32 files · ~21,285 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 225 nodes · 319 edges · 25 communities (13 shown, 12 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fc2294d0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Authorized Offensive Security Engine
- package.json
- server.ts
- .eslintrc.json
- compilerOptions
- verify.ts
- Contributing Guidelines
- devDependencies
- scripts
- vidence-recon-mcp README banner
- runner.ts
- .prettierrc.json
- specs.ts
- Graphify Skill Trigger
- Bug Report Template
- content_fuzz tool
- dir_bruteforce tool
- dns_enum tool
- http_headers tool
- nikto_scan tool
- nmap_scan tool
- nuclei_scan tool
- tls_scan tool
- whatweb tool
- wpscan tool

## God Nodes (most connected - your core abstractions)
1. `buildServer()` - 13 edges
2. `compilerOptions` - 12 edges
3. `extractHost()` - 9 edges
4. `Authorized Offensive Security Engine` - 9 edges
5. `vidence-recon-mcp` - 9 edges
6. `scripts` - 8 edges
7. `makeVerifier()` - 8 edges
8. `Playbooks (MCP Prompts)` - 8 edges
9. `checkScope()` - 7 edges
10. `Config` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Ownership Verification Service` --semantically_similar_to--> `Scope Allowlist Guard`  [INFERRED] [semantically similar]
  docs/DESIGN_OFFENSIVE_ENGINE.md → README.md
- `Publish Image Workflow` --references--> `vidence-recon-mcp`  [INFERRED]
  .github/workflows/release-image.yml → README.md
- `Quick Start (npx)` --references--> `Publish Image Workflow`  [INFERRED]
  README.md → .github/workflows/release-image.yml
- `Graphify Project Instructions` --conceptually_related_to--> `Graphify Skill Trigger`  [INFERRED]
  CLAUDE.md → .claude/CLAUDE.md
- `Contributing Guidelines` --references--> `CI Pipeline`  [EXTRACTED]
  CONTRIBUTING.md → .github/workflows/ci.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Offensive engine defense-in-depth gates** — docs_design_offensive_engine_ownership_verification, docs_design_offensive_engine_authorization_scope_engine, docs_design_offensive_engine_human_in_the_loop_approval, docs_design_offensive_engine_ephemeral_runner, docs_design_offensive_engine_audit_evidence, docs_design_offensive_engine_kill_switch [EXTRACTED 0.95]
- **Structural safety controls (tier gate + scope + no-shell + blocklist)** — readme_scope_allowlist, readme_three_tier_safety_model, readme_destructive_flag_blocklist, readme_safety_model [EXTRACTED 1.00]
- **Detection toolset gated by scope + tier model** — readme_http_headers, readme_whatweb, readme_dns_enum, readme_tls_scan, readme_nmap_scan, readme_nikto_scan, readme_nuclei_scan, readme_dir_bruteforce, readme_content_fuzz, readme_wpscan, readme_sqli_detect, readme_scope_tool, readme_scope_allowlist, readme_three_tier_safety_model [INFERRED 0.85]

## Communities (25 total, 12 thin omitted)

### Community 0 - "Authorized Offensive Security Engine"
Cohesion: 0.08
Nodes (34): Publish Image Workflow, 0.1.0 Initial Release, Tamper-Evident Audit & Evidence, Authorization & Scope Engine, Core Data Model, Engagement Manager, Ephemeral Isolated Runner, Exploit Tier (+26 more)

### Community 1 - "package.json"
Cohesion: 0.07
Nodes (27): author, bin, vidence-recon-mcp, bugs, url, dependencies, @modelcontextprotocol/sdk, zod (+19 more)

### Community 2 - "server.ts"
Cohesion: 0.13
Nodes (20): @modelcontextprotocol/sdk, loadConfig(), main(), Playbook, PLAYBOOKS, GLOBAL_BLOCKED_FLAGS, isTierAllowed(), SAFETY_BANNER (+12 more)

### Community 3 - ".eslintrc.json"
Cohesion: 0.12
Nodes (15): env, es2022, node, extends, ignorePatterns, parser, parserOptions, ecmaVersion (+7 more)

### Community 4 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 5 - "verify.ts"
Cohesion: 0.16
Nodes (13): Config, ConfigSchema, DNS_PREFIX, expectedToken(), HTTP_WELL_KNOWN, HttpProbeResult, makeVerifier(), checkDns() (+5 more)

### Community 6 - "Contributing Guidelines"
Cohesion: 0.31
Nodes (7): Feature Request Template, Pull Request Template, CI Pipeline, Code of Conduct, Contributing Guidelines, Safety-Critical Files (scope.ts/exec.ts/safety.ts), ToolSpec Declaration

### Community 7 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, eslint, prettier, @types/node, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, vitest

### Community 8 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, format, lint, prepare, start, test

### Community 9 - "vidence-recon-mcp README banner"
Cohesion: 0.43
Nodes (7): vidence-recon-mcp README banner, detection-only badge, MIT license badge, vidence-recon-mcp, Radar sweep with shield checkmark motif, scope-gated badge, Authorized security recon & OWASP playbooks, exposed over MCP

### Community 10 - "runner.ts"
Cohesion: 0.15
Nodes (15): vitest, ExecResult, run(), ExecOpts, log(), makeDockerRunner(), ensureReady(), exec() (+7 more)

### Community 11 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 12 - "specs.ts"
Cohesion: 0.43
Nodes (5): zod, SafetyLevel, extraArgs, TOOLS, ToolSpec

## Knowledge Gaps
- **103 isolated node(s):** `root`, `parser`, `plugins`, `eslint:recommended`, `plugin:@typescript-eslint/recommended` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 114 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `runner.ts` to `package.json`, `server.ts`, `verify.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `buildServer()` (e.g. with `.exec()` and `.verify()`) actually correct?**
  _`buildServer()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `root`, `parser`, `plugins` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorized Offensive Security Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.0761904761904762 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `specs.ts` to `package.json`, `server.ts`, `verify.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Why does `@modelcontextprotocol/sdk` connect `server.ts` to `package.json`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._