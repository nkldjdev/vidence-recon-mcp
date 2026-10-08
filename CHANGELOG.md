# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
