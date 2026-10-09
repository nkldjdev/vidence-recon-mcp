# vidence-recon-mcp — all-in-one image: Kali + security tools + Node + the MCP server.
#
# The MCP client runs this container over stdio; the server executes its
# playbooks against the tools that live INSIDE this same Kali image, so there is
# nothing to install on the host. This is the self-contained "MCP ↔ Kali" build.
#
# Build:  docker build -t vidence-recon-mcp .
# Run  :  docker run -i --rm --cap-add=NET_RAW --cap-add=NET_ADMIN \
#            -e VIDENCE_RECON_MCP_ALLOWED_TARGETS=vidence.io vidence-recon-mcp
#
# LICENSING: this image bundles third-party tools (nmap, nuclei, sqlmap, …),
# each under its own license. Running them as separate processes does not
# relicense this MIT code, but if you redistribute the built image you are
# redistributing those tools and must honor their licenses.

# ---- stage 1: compile the TypeScript server with Node -----------------------
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
# --ignore-scripts: skip the package.json "prepare" hook, which would run `tsc`
# before src/ is copied (src is copied on the next line). We build explicitly.
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- stage 2: Kali runtime with the tools + Node ----------------------------
FROM kalilinux/kali-rolling
ENV DEBIAN_FRONTEND=noninteractive

# Node runtime + the detection toolset. dnsutils provides `dig` (used by the
# dns_enum tool). seclists/wordlists give the fuzzing playbooks a wordlist at
# /usr/share/seclists and /usr/share/wordlists.
RUN apt-get update && \
    apt-get -y install --no-install-recommends \
      nodejs \
      nmap nikto whatweb sslscan gobuster ffuf nuclei wpscan sqlmap \
      dnsutils curl ca-certificates \
      seclists wordlists && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Pre-pull Nuclei templates so the first scan isn't slow (ignore if offline).
RUN nuclei -update-templates 2>/dev/null || true

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config.example.json README.md DISCLAIMER.md LICENSE ./

# MCP speaks over stdio — no ports exposed. Provide scope via env or a mounted
# config.json (mount to /app/config.json). The server refuses any out-of-scope
# target regardless.
ENTRYPOINT ["node", "dist/index.js"]
