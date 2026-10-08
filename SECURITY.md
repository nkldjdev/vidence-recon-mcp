# Security Policy

## Reporting a vulnerability in vidence-recon-mcp

If you find a security issue **in this server itself** (for example: a way to bypass the scope
guard, a command-injection path through a tool wrapper, or an extra-arg screen bypass), please
report it privately:

- Use GitHub's **"Report a vulnerability"** (Security → Advisories) on this repository, **or**
- email the maintainer (add your contact here).

Please include steps to reproduce and the version/commit. Do not open a public issue for an
unpatched vulnerability.

We aim to acknowledge reports within a few days. Fixes for confirmed scope-bypass or
command-injection issues are treated as the highest priority, because they are the controls the
whole project depends on.

## Scope of this policy

This policy covers the `vidence-recon-mcp` code. It does **not** cover vulnerabilities in the
third-party tools the server invokes (report those upstream) or misuse of the tool against
systems you are not authorized to test (see [DISCLAIMER.md](DISCLAIMER.md)).
