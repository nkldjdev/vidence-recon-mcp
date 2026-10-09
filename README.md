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

## Quick start (npx)

You need **Docker Desktop installed and running** — that's the only prerequisite. The server
installs via `npx` and **pulls the Kali tool host automatically on first run**. Add this to your
MCP client (Claude Desktop `claude_desktop_config.json`, Claude Code, …):

```json
{
  "mcpServers": {
    "vidence-recon": {
      "command": "npx",
      "args": ["-y", "vidence-recon-mcp@latest"],
      "env": {
        "VIDENCE_RECON_MCP_ALLOWED_TARGETS": "example.com",
        "VIDENCE_RECON_MCP_RUNNER": "docker",
        "VIDENCE_RECON_MCP_VERIFY_SECRET": "<your-secret>"
      }
    }
  }
}
```

Generate the secret once and keep it (treat it like a password):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Restart the client. **Two gates must pass before any tool runs:**

1. **Scope** — the target is in `VIDENCE_RECON_MCP_ALLOWED_TARGETS`.
2. **Ownership** — you've *proven* you control it. Ask your client to run the **`verify`** tool
   with your target; it prints a DNS `TXT` record (or HTTP file) to publish. Publish it, then run
   `verify` again until it reports `✅ VERIFIED`. (Why: [Ownership verification](#ownership-verification-authorization-lockdown).)

> **Testing `localhost`, an internal IP, or a lab/CTF box you own outright?** A DNS/HTTP challenge
> can't apply to those, so add `"VIDENCE_RECON_MCP_REQUIRE_VERIFICATION": "false"` to `env` to run
> on the scope allowlist alone. Only do this for machines you fully own.

On first use the server also pulls the `ghcr.io/nkldjdev/vidence-recon-mcp` image (several GB) and
starts a background `vidence-kali` container — the first scan after that works, later runs are
instant. Run the `scope` tool anytime to see exactly what's authorized right now.

Knobs: `VIDENCE_RECON_MCP_AUTOSTART=false` to manage the container yourself,
`VIDENCE_RECON_MCP_IMAGE=…` for a custom image, `VIDENCE_RECON_MCP_CONTAINER=…` to rename it.
**Already on Kali** with the tools on `PATH`? Drop the `RUNNER` var — the server runs them
locally. Full manual options (all-in-one image, native build) are under **Running it** below.

---

## Why this exists

There are already thin "let an LLM run nmap" wrappers. This project is different in three ways:

1. **Methodology, not just tools.** Predefined, OWASP/PTES-aligned **playbooks** (`recon`,
   `web_owasp`, `web_quickscan`, `cms_wordpress`, `network_host`) chain tools and ask for a
   findings report — so you get an assessment, not a pile of raw output.
2. **Safety is structural.** A **scope allowlist** means no tool runs against a host you did not
   authorize (checked by resolved IP, including CIDR ranges), and — on by default — the server
   requires **cryptographic proof you own the target** (a DNS/HTTP challenge) before any tool runs.
   A **three-tier safety model** (`safe` / `active` / `intrusive`) gates aggressive tools, and a
   hard **blocklist** stops the destructive flags (`sqlmap --dump`, `--os-shell`, …) that would
   turn detection into an attack.
3. **Detection-focused by design.** It is an assessment toolkit, not an exploitation framework
   (see *Scope & philosophy*).

## Scope & philosophy

`vidence-recon-mcp` covers **reconnaissance, scanning, and vulnerability *detection***. It deliberately
does **not** ship turnkey exploitation or post-exploitation (no Metasploit exploit modules, no
data exfiltration, no reverse shells, no third-party credential cracking). That line is what
keeps the project legal to publish, trustworthy to run, and welcome in a community. The
architecture is extensible — you can add tools — but contributions that cross into weaponized
exploitation will not be merged into core.

## Ownership verification (authorization lockdown)

Being on the allowlist is an *assertion* ("this is mine"). Before any tool runs, the server also
requires **proof** that you control the target — so the engine is structurally confined to assets
you actually own. This is **on by default** (`verification.required: true`).

Each target's challenge token is `HMAC-SHA256(your-secret, host)`. Publishing it requires both
your private secret **and** control of the host's DNS or web root — so you can't point this at
someone else's domain, and nobody without your secret can forge a token for one of yours.

**Setup (one minute):**

1. Generate a stable, private secret once and keep it (treat it like a password):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Set it as `VIDENCE_RECON_MCP_VERIFY_SECRET` (or `verification.secret` in `config.json`).
2. Call the **`verify`** tool with your target — it prints the exact DNS `TXT` record (or HTTP
   `.well-known` file) to publish.
3. Publish that record, then call `verify` again. Once it reports `✅ VERIFIED`, tools may run
   against that target. Positive results are cached for `verification.cacheTtlSec`.

The HTTP check refuses redirects (the proof must be served directly), and verification is
re-checked per target. For an isolated lab/CTF box you own outright, set
`verification.required: false` (or `VIDENCE_RECON_MCP_REQUIRE_VERIFICATION=false`) to fall back to
allowlist-only. See [`src/verify.ts`](src/verify.ts) and
[`docs/DESIGN_OFFENSIVE_ENGINE.md`](docs/DESIGN_OFFENSIVE_ENGINE.md) §5.

## Tools

| Tool | Tier | What it does |
|---|---|---|
| `http_headers` | safe | HTTP response headers (curl) |
| `whatweb` | safe | Web tech/stack fingerprinting |
| `dns_enum` | safe | DNS records via dig |
| `tls_scan` | safe | TLS/SSL config + cert (sslscan) |
| `nmap_scan` | active | Ports + service/version |
| `nikto_scan` | active | Web server known-issue scan |
| `nuclei_scan` | active | ProjectDiscovery Nuclei templates |
| `dir_bruteforce` | active | Path/file discovery (gobuster) |
| `content_fuzz` | active | Fuzzing (ffuf) |
| `wpscan` | active | WordPress enumeration |
| `sqli_detect` | intrusive | SQLi **detection** via sqlmap (data-extraction flags blocked) |
| `verify` | — | Prove you own a target (DNS/HTTP challenge) so tools may run against it |
| `scope` | — | Show authorized scope + enabled tiers + verification status |

Tools are declared as specs in [`src/tools/specs.ts`](src/tools/specs.ts) — adding one is a few
lines (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Playbooks (MCP prompts)

`recon` · `web_owasp` · `web_quickscan` · `cms_wordpress` · `network_host` — each takes a target
and produces a scoped, methodology-driven assessment. Defined in
[`src/playbooks.ts`](src/playbooks.ts).

## Running it — three ways

- **A) Docker all-in-one:** the image is **Kali + all the tools + Node + the server**; the MCP
  client runs the container with `docker run -i`. Simplest on **Linux/macOS**. ⚠️ **Not
  recommended on Windows** — Docker Desktop's `docker run -i` stdio is unreliable there and the
  server will disconnect. Use B instead.
- **B) Native server + Kali container (recommended on Windows):** run the server with `node` on
  the host, and it runs the tools via `docker exec` into a **persistent Kali container** built
  from this same image. The Claude↔server channel is native Node (reliable everywhere); only the
  tools run in Docker. No per-connection container startup.
- **C) Local Node:** run the server with `node` and supply the tools yourself on `PATH` (a
  Kali/Debian box or WSL). Node.js ≥ 18. A missing binary returns a clear "not found" message.

### A) Docker all-in-one (Linux/macOS)

```bash
git clone https://github.com/nkldjdev/vidence-recon-mcp.git
cd vidence-recon-mcp
docker build -t vidence-recon-mcp .   # Kali + tools + server; several GB, first build is slow
```

Point Claude at the container (MCP speaks over stdio):

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vidence-recon": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--cap-add=NET_RAW", "--cap-add=NET_ADMIN",
        "-e", "VIDENCE_RECON_MCP_ALLOWED_TARGETS=app.example.com,example.com",
        "vidence-recon-mcp"
      ]
    }
  }
}
```

**Claude Code (CLI):**

```bash
claude mcp add vidence-recon -- docker run -i --rm --cap-add=NET_RAW --cap-add=NET_ADMIN -e VIDENCE_RECON_MCP_ALLOWED_TARGETS=app.example.com vidence-recon-mcp
```

`NET_RAW`/`NET_ADMIN` let `nmap` run SYN scans. Prefer a config file over the env var? Mount it:
add `"-v", "/abs/path/config.json:/app/config.json"` to the args.

### B) Native server + Kali container (recommended on Windows)

Build the image (it's used as the tool host), start it as a **persistent idle container**, and
build the server to run natively:

```bash
git clone https://github.com/nkldjdev/vidence-recon-mcp.git
cd vidence-recon-mcp
docker build -t vidence-recon-mcp .                         # Kali + tools (several GB)
docker run -d --name vidence-kali \
  --cap-add=NET_RAW --cap-add=NET_ADMIN \
  --entrypoint sleep vidence-recon-mcp infinity              # idle Kali tool host
npm install && npm run build                                 # build the native server
```

Point Claude at the **native node server**, with runner set to `docker` so tools run via
`docker exec vidence-kali <tool>`:

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vidence-recon": {
      "command": "node",
      "args": ["C:\\path\\to\\vidence-recon-mcp\\dist\\index.js"],
      "env": {
        "VIDENCE_RECON_MCP_ALLOWED_TARGETS": "app.example.com,example.com",
        "VIDENCE_RECON_MCP_RUNNER": "docker",
        "VIDENCE_RECON_MCP_CONTAINER": "vidence-kali"
      }
    }
  }
}
```

The server talks to Claude over native stdio (reliable on Windows), and shells each tool into the
always-running `vidence-kali` container. After a reboot or Docker restart, bring the tool host
back with `docker start vidence-kali`. Both `node` and `docker` must be on the PATH Claude
launches with (they usually are); otherwise use full paths.

### C) Local Node

```bash
git clone https://github.com/nkldjdev/vidence-recon-mcp.git
cd vidence-recon-mcp
npm install && npm run build
cp config.example.json config.json    # then edit scope.allowedTargets
```

`config.json` (see [`config.example.json`](config.example.json)):

```jsonc
{
  "scope": { "allowedTargets": ["app.example.com"] },
  "safety": { "allowActive": true, "allowIntrusive": false, "allowRawArgs": false, "minIntervalMs": 0 },
  // Ownership verification is required by default: set a stable secret and prove each PUBLIC
  // target with the `verify` tool. For localhost / internal IPs / a lab you own outright, set
  // "required": false instead — they can't satisfy a DNS/HTTP challenge.
  "verification": { "required": true, "secret": "<64-hex from crypto.randomBytes>", "methods": ["dns", "http"], "cacheTtlSec": 3600 },
  "limits": { "commandTimeoutSec": 300, "maxOutputBytes": 1048576 }
}
```

Env overrides: `VIDENCE_RECON_MCP_CONFIG`, `VIDENCE_RECON_MCP_ALLOWED_TARGETS=a,b,c`,
`VIDENCE_RECON_MCP_ALLOW_INTRUSIVE=true`, `VIDENCE_RECON_MCP_VERIFY_SECRET=…`,
`VIDENCE_RECON_MCP_REQUIRE_VERIFICATION=false` (allowlist-only, for hosts you own outright).

**Claude Desktop:**

```json
{
  "mcpServers": {
    "vidence-recon": {
      "command": "node",
      "args": ["/absolute/path/to/vidence-recon-mcp/dist/index.js"],
      "env": { "VIDENCE_RECON_MCP_CONFIG": "/absolute/path/to/vidence-recon-mcp/config.json" }
    }
  }
}
```

### Then run

Restart Claude and ask: *"Run the `web_quickscan` playbook against https://app.example.com"*
(the target must be in your allowlist **and** verified). Start with `scope` to see what's
authorized, run `verify` to prove ownership (or set `REQUIRE_VERIFICATION=false` for a host you
own outright), then the read-only `safe` tools, then the playbooks.

## Safety model in one paragraph

Every tool call is (1) gated to its safety tier, (2) refused unless the target resolves entirely
within your allowlist, (3) refused unless you've *proven* you own the target (DNS/HTTP challenge,
on by default), (4) built from structured parameters with **no shell** (so argument values can't
inject commands), and (5) screened against a destructive-flag blocklist. The allowlist is your
assertion of intent; ownership verification is the proof that backs it — together they make
pointing this at someone else's systems structurally hard, not merely forbidden. (You can drop
gate 3 for hosts you own outright, but then authorization rests on the allowlist alone.)

## Contributing

PRs welcome — especially new detection tools and playbooks. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues in
*this server*: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The third-party tools this server invokes keep their own licenses; invoking them
as separate processes does not relicense them, but if you redistribute a Docker image that
*bundles* them you must honor their licenses.
