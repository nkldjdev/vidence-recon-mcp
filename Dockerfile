# Builds the vidence-recon-mcp Node server. It does NOT bundle the security tools
# themselves — run it on a host (e.g. Kali/Debian) where nmap/nuclei/etc. are on
# PATH, or extend this image to add them.
#
# NOTE on licensing: if you choose to add GPL tools below and redistribute the
# resulting image, you are redistributing those tools and must comply with their
# licenses (source availability, etc.). Invoking them as separate processes does
# not relicense this MIT code, but bundling + distributing does carry obligations.

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config.example.json ./config.example.json
COPY README.md DISCLAIMER.md LICENSE ./

# MCP speaks over stdio; no ports are exposed. Provide config via a mount or env:
#   docker run -i --rm -e VIDENCE_RECON_MCP_ALLOWED_TARGETS=example.com vidence-recon-mcp
ENTRYPOINT ["node", "dist/index.js"]
