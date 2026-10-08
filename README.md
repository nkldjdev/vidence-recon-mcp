<p align="center">
  <img src="assets/scope1.png" alt="vidence-recon-mcp" width="100%">
</p>

<h1 align="center">vidence-recon-mcp</h1>

<p align="center">
  A safe, batteries-included <b>Model Context Protocol (MCP)</b> server that gives an AI client
  (Claude, or any MCP host) a curated set of security-testing tools and OWASP-aligned playbooks —
  <b>for authorized testing only.</b>
</p>

<p align="center">
  <b>Part of the <a href="https://vidence.io">Vidence</a> project</b> · security-led, EU-first
</p>

<p align="center">
  <a href="https://github.com/nkldjdev/vidence-recon-mcp/actions"><img src="https://github.com/nkldjdev/vidence-recon-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-3987e5" alt="License: MIT">
  <img src="https://img.shields.io/badge/node-%3E%3D18-0ca30c" alt="Node >=18">
  <img src="https://img.shields.io/badge/MCP-server-3987e5" alt="MCP server">
</p>

Point it at a web app or host **you own or are authorized to test**, ask your AI client to run
the `recon` or `web_owasp` playbook, and it will chain the right tools and hand back findings
with severity and remediation.

> ⚠️ **Authorized use only.** Running these tools against systems you do not own or have explicit
> written permission to test is illegal in most countries. See [DISCLAIMER.md](DISCLAIMER.md).
> You are solely responsible for how you use this software.

---

## Why this exists

There are already thin "let an LLM run nmap" wrappers. This project is different in three ways:

1. **Methodology, not just tools.** Predefined, OWASP/PTES-aligned **playbooks** (`recon`,
   `web_owasp`, `web_quickscan`, `cms_wordpress`, `network_host`) chain tools and ask for a
   findings report — so you get an assessment, not a pile of raw output.
2. **Safety is structural.** A **scope allowlist** means no tool runs against a host you did not
   authorize (checked by resolved IP, including CIDR ranges). A **three-tier safety model**
   (`safe` / `active` / `intrusive`) gates aggressive tools, and a hard **blocklist** stops the
   destructive flags (`sqlmap --dump`, `--os-shell`, …) that would turn detection into an attack.
3. **Detection-focused by design.** It is an assessment toolkit, not an exploitation framework
   (see *Scope & philosophy*).

## Scope & philosophy

`vidence-recon-mcp` covers **reconnaissance, scanning, and vulnerability *detection***. It deliberately
does **not** ship turnkey exploitation or post-exploitation (no Metasploit exploit modules, no
data exfiltration, no reverse shells, no third-party credential cracking). That line is what
keeps the project legal to publish, trustworthy to run, and welcome in a community. The
architecture is extensible — you can add tools — but contributions that cross into weaponized
exploitation will not be merged into core.

## Tools

| Tool | Tier | What it does |
|---|---|---|
| `http_headers` | safe | HTTP response headers (curl) |
| `whatweb` | safe | Web tech/stack fingerprinting |
| `dns_enum` | safe | DNS records via dnsx |
| `tls_scan` | safe | TLS/SSL config + cert (sslscan) |
| `nmap_scan` | active | Ports + service/version |
| `nikto_scan` | active | Web server known-issue scan |
| `nuclei_scan` | active | ProjectDiscovery Nuclei templates |
| `dir_bruteforce` | active | Path/file discovery (gobuster) |
| `content_fuzz` | active | Fuzzing (ffuf) |
| `wpscan` | active | WordPress enumeration |
| `sqli_detect` | intrusive | SQLi **detection** via sqlmap (data-extraction flags blocked) |
| `scope` | — | Show authorized scope + enabled tiers |

Tools are declared as specs in [`src/tools/specs.ts`](src/tools/specs.ts) — adding one is a few
lines (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Playbooks (MCP prompts)

`recon` · `web_owasp` · `web_quickscan` · `cms_wordpress` · `network_host` — each takes a target
and produces a scoped, methodology-driven assessment. Defined in
[`src/playbooks.ts`](src/playbooks.ts).

## Requirements

- Node.js ≥ 18
- The underlying tools you want to use, on `PATH` (or pathed in `config.json`). Easiest is to run
  on a Kali/Debian box, or any host with the relevant packages installed. The server degrades
  gracefully: a missing binary returns a clear "not found" message, not a crash.

## Install

```bash
git clone https://github.com/OWNER/vidence-recon-mcp.git
cd vidence-recon-mcp
npm install
npm run build
cp config.example.json config.json   # then edit scope.allowedTargets
```

## Configure

Edit `config.json` (see [`config.example.json`](config.example.json)):

```jsonc
{
  "scope": { "allowedTargets": ["localhost", "127.0.0.1", "app.example.com", "10.0.0.0/24"] },
  "safety": { "allowActive": true, "allowIntrusive": false, "allowRawArgs": false, "minIntervalMs": 0 },
  "limits": { "commandTimeoutSec": 300, "maxOutputBytes": 1048576 }
}
```

Environment overrides: `VIDENCE_RECON_MCP_CONFIG`, `VIDENCE_RECON_MCP_ALLOWED_TARGETS=a,b,c`,
`VIDENCE_RECON_MCP_ALLOW_INTRUSIVE=true`.

## Connect to Claude

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pentest": {
      "command": "node",
      "args": ["/absolute/path/to/vidence-recon-mcp/dist/index.js"],
      "env": { "VIDENCE_RECON_MCP_CONFIG": "/absolute/path/to/vidence-recon-mcp/config.json" }
    }
  }
}
```

**Claude Code (CLI):**

```bash
claude mcp add pentest -- node /absolute/path/to/vidence-recon-mcp/dist/index.js
```

Then ask: *"Run the web_quickscan playbook against https://app.example.com"* (it must be in your
allowlist).

## Docker

```bash
docker build -t vidence-recon-mcp .
# the image bundles the Node server; mount your config and run against your Kali tools as needed
```

See the `Dockerfile` header for the tool-bundling note and the licensing implications of
redistributing an image that contains third-party tools.

## Safety model in one paragraph

Every tool call is (1) gated to its safety tier, (2) refused unless the target resolves entirely
within your allowlist, (3) built from structured parameters with **no shell** (so argument values
can't inject commands), and (4) screened against a destructive-flag blocklist. The server can't
enforce that *you* are authorized — that's on you, and you assert it by configuring scope — but
it makes misuse hard and accidents unlikely.

## Contributing

PRs welcome — especially new detection tools and playbooks. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues in
*this server*: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The third-party tools this server invokes keep their own licenses; invoking them
as separate processes does not relicense them, but if you redistribute a Docker image that
*bundles* them you must honor their licenses.
