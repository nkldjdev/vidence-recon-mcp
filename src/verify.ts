import { createHmac } from "node:crypto";
import { resolveTxt as dnsResolveTxt } from "node:dns/promises";
import { extractHost } from "./scope.js";
import type { Config } from "./config.js";

/**
 * Ownership verification — the gate that turns "I assert this target is mine"
 * into "I have PROVEN I control this target". A target is testable only when the
 * operator has published a challenge token derived from THEIR secret:
 *
 *   token = HMAC-SHA256(verification.secret, host)
 *
 * Publishing that token requires controlling the host's DNS or web root, AND
 * knowing the operator's secret. An attacker cannot compute the token for a
 * victim's domain (no secret), and the operator cannot verify a domain they do
 * not control (can't publish the record). That is what structurally confines
 * the engine to the operator's own assets — see docs/DESIGN_OFFENSIVE_ENGINE.md §5.
 */

export interface VerificationResult {
  verified: boolean;
  reason: string;
  method?: "dns" | "http" | "disabled";
}

export const DNS_PREFIX = "_vidence-verify";
export const HTTP_WELL_KNOWN = "/.well-known/vidence-verify";

/** Deterministic per-host ownership token = HMAC-SHA256(secret, host), hex. */
export function expectedToken(secret: string, host: string): string {
  return createHmac("sha256", secret).update(host.toLowerCase()).digest("hex");
}

export interface VerificationInstructions {
  host: string;
  token: string;
  dns: { record: string; type: "TXT"; value: string };
  http: { url: string };
}

/** What the operator must publish to prove control of `host`. Pure. */
export function verificationInstructions(secret: string, host: string): VerificationInstructions {
  const h = extractHost(host).toLowerCase();
  const token = expectedToken(secret, h);
  return {
    host: h,
    token,
    dns: { record: `${DNS_PREFIX}.${h}`, type: "TXT", value: `vidence-verify=${token}` },
    http: { url: `https://${h}${HTTP_WELL_KNOWN}/${token}` },
  };
}

export interface HttpProbeResult {
  ok: boolean;
  status: number;
  body: string;
  /** True if the response was reached through one or more redirects. */
  redirected: boolean;
}

export interface VerifierDeps {
  resolveTxt?: (name: string) => Promise<string[][]>;
  fetchUrl?: (url: string) => Promise<HttpProbeResult>;
  now?: () => number;
}

export interface Verifier {
  /** Live-check that `target` is a proven-owned asset. */
  verify(target: string): Promise<VerificationResult>;
}

async function defaultFetch(url: string): Promise<HttpProbeResult> {
  // `redirect: "error"` rejects redirects outright: the proof must be served
  // directly at the well-known path, so a victim host that 302s elsewhere
  // (or an open redirect) can never satisfy the challenge.
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  const body = (await res.text().catch(() => "")).slice(0, 4096);
  return { ok: res.ok, status: res.status, body, redirected: res.redirected };
}

export function makeVerifier(cfg: Config, deps: VerifierDeps = {}): Verifier {
  const resolveTxt = deps.resolveTxt ?? dnsResolveTxt;
  const fetchUrl = deps.fetchUrl ?? defaultFetch;
  const now = deps.now ?? Date.now;
  const v = cfg.verification;
  // Positive results are cached for the configured TTL. Negative results are
  // cached only briefly, to absorb a client's retry loop without re-running a
  // DNS + two HTTP probes on every tool call, while still letting a freshly
  // published challenge be picked up quickly. Keyed with the token so a rotated
  // secret never returns a stale positive.
  const NEGATIVE_CACHE_MS = 10_000;
  const cache = new Map<string, { result: VerificationResult; at: number; token: string }>();

  async function checkDns(host: string, token: string): Promise<boolean> {
    try {
      const records = await resolveTxt(`${DNS_PREFIX}.${host}`);
      return records.some((chunks) => chunks.join("").includes(token));
    } catch {
      return false;
    }
  }

  async function checkHttp(host: string, token: string): Promise<boolean> {
    for (const scheme of ["https", "http"] as const) {
      try {
        const res = await fetchUrl(`${scheme}://${host}${HTTP_WELL_KNOWN}/${token}`);
        if (res.ok && !res.redirected && res.body.includes(token)) return true;
      } catch {
        // try the next scheme
      }
    }
    return false;
  }

  async function verify(target: string): Promise<VerificationResult> {
    if (!v.required) {
      return { verified: true, reason: "ownership verification disabled (verification.required=false)", method: "disabled" };
    }
    if (!v.secret) {
      return {
        verified: false,
        reason:
          "ownership verification is required but no verification.secret is set — call the 'verify' tool, or set VIDENCE_RECON_MCP_VERIFY_SECRET.",
      };
    }

    const host = extractHost(target).toLowerCase();
    const token = expectedToken(v.secret, host);

    const hit = cache.get(host);
    if (hit && hit.token === token) {
      const ttl = hit.result.verified ? v.cacheTtlSec * 1000 : NEGATIVE_CACHE_MS;
      if (now() - hit.at < ttl) return hit.result;
    }

    const remember = (result: VerificationResult): VerificationResult => {
      cache.set(host, { result, at: now(), token });
      return result;
    };

    if (v.methods.includes("dns") && (await checkDns(host, token))) {
      return remember({ verified: true, reason: `DNS TXT ${DNS_PREFIX}.${host} proves control.`, method: "dns" });
    }
    if (v.methods.includes("http") && (await checkHttp(host, token))) {
      return remember({ verified: true, reason: `HTTP ${HTTP_WELL_KNOWN}/… on ${host} proves control.`, method: "http" });
    }

    return remember({
      verified: false,
      reason: `'${host}' is not a proven-owned asset. Publish the DNS TXT record or HTTP file from the 'verify' tool, then retry.`,
    });
  }

  return { verify };
}
