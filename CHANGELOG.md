# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Ownership verification** — a target must be *proven*-owned (not merely allowlisted) before
  any tool runs against it. Challenge token is `HMAC-SHA256(verification.secret, host)`, proven via
  a DNS `TXT` record or an HTTP `.well-known` file (redirects refused). New `verify` tool prints the
  challenge and reports live status; the `scope` tool now shows verification posture. See
  `src/verify.ts` and `docs/DESIGN_OFFENSIVE_ENGINE.md` §5.
- `Runner` seam (`src/runner.ts`) with `LocalRunner` / `DockerRunner` adapters: tool execution no
  longer branches on runner mode at the call site, and the Kali container lifecycle lives entirely
  behind the adapter.

### Changed
- **BREAKING:** ownership verification is **required by default** (`verification.required: true`).
  Deployments upgrading without a `verification` block will see every tool refuse with
  `Refused (unverified target)` until a secret is set (`VIDENCE_RECON_MCP_VERIFY_SECRET`) and a
  challenge is published via the `verify` tool. A startup warning is logged to stderr. For isolated
  labs/CTF boxes you own outright, set `verification.required: false` (or
  `VIDENCE_RECON_MCP_REQUIRE_VERIFICATION=false`) to keep allowlist-only behavior.

### Removed
- `src/provision.ts` — its container-lifecycle logic moved into `DockerRunner`.

## [0.1.0] - 2026-10-08

### Added
- Initial release: MCP server (stdio) exposing security-testing tools and playbooks.
- Scope allowlist guard with hostname/IP/CIDR support and resolve-by-IP enforcement.
- Three-tier safety model (`safe` / `active` / `intrusive`) with destructive-flag blocklist.
- Tools: `http_headers`, `whatweb`, `dns_enum`, `tls_scan`, `nmap_scan`, `nikto_scan`,
  `nuclei_scan`, `dir_bruteforce`, `content_fuzz`, `wpscan`, `sqli_detect`, `scope`.
- Playbooks (MCP prompts): `recon`, `web_owasp`, `web_quickscan`, `cms_wordpress`,
  `network_host`.
- Docker image, CI (lint + build + test), and contributor docs.
