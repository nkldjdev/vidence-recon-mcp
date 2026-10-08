import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Scope guard. A target is authorized only if it (or every IP it resolves to)
 * is covered by the allowlist. Entries may be hostnames, IPs, or IPv4 CIDRs.
 *
 * This is the single most important safety control in the server: no tool runs
 * against a host the operator has not explicitly listed as authorized.
 */

export function extractHost(target: string): string {
  let t = target.trim();
  // Strip scheme.
  const scheme = t.indexOf("://");
  if (scheme !== -1) t = t.slice(scheme + 3);
  // Strip path / query.
  t = t.split("/")[0].split("?")[0];
  // Strip userinfo.
  const at = t.lastIndexOf("@");
  if (at !== -1) t = t.slice(at + 1);
  // Strip port (but keep IPv6 brackets intact).
  if (t.startsWith("[")) {
    const close = t.indexOf("]");
    if (close !== -1) return t.slice(1, close);
  }
  const colon = t.indexOf(":");
  if (colon !== -1) t = t.slice(0, colon);
  return t;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

async function resolveAll(host: string): Promise<string[]> {
  try {
    const results = await lookup(host, { all: true });
    return results.map((r) => r.address);
  } catch {
    return [];
  }
}

export interface ScopeResult {
  authorized: boolean;
  reason: string;
}

export async function checkScope(
  target: string,
  allowed: string[],
): Promise<ScopeResult> {
  if (allowed.length === 0) {
    return {
      authorized: false,
      reason:
        "No authorized targets configured. Set scope.allowedTargets in config.json (or VIDENCE_RECON_MCP_ALLOWED_TARGETS).",
    };
  }

  const host = extractHost(target);

  // Direct literal match on what the operator listed.
  if (allowed.includes(host) || allowed.includes(target)) {
    return { authorized: true, reason: `'${host}' matches an allowlist entry.` };
  }

  // Separate allowlist into CIDRs, literal IPs, and hostnames.
  const cidrs = allowed.filter((a) => a.includes("/"));
  const allowedIps = new Set(allowed.filter((a) => net.isIP(a)));
  const allowedHosts = allowed.filter((a) => !a.includes("/") && !net.isIP(a));

  // Resolve the requested host and every allow-listed hostname to IPs, then
  // require that EVERY resolved IP of the target is in scope. This blocks a
  // hostname that quietly resolves off-scope.
  const targetIps = net.isIP(host) ? [host] : await resolveAll(host);
  if (targetIps.length === 0) {
    return {
      authorized: false,
      reason: `Could not resolve '${host}', and it is not a literal allowlist entry.`,
    };
  }

  for (const h of allowedHosts) {
    for (const ip of await resolveAll(h)) allowedIps.add(ip);
  }

  for (const ip of targetIps) {
    const okByIp = allowedIps.has(ip);
    const okByCidr = cidrs.some((c) => inCidr(ip, c));
    if (!okByIp && !okByCidr) {
      return {
        authorized: false,
        reason: `'${host}' resolves to ${ip}, which is not in the authorized scope.`,
      };
    }
  }

  return { authorized: true, reason: `All resolved IPs of '${host}' are in scope.` };
}
