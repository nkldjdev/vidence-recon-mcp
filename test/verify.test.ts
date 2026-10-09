import { describe, it, expect } from "vitest";
import {
  expectedToken,
  verificationInstructions,
  makeVerifier,
  DNS_PREFIX,
  type VerifierDeps,
} from "../src/verify.js";
import type { Config } from "../src/config.js";

function cfg(overrides: Partial<Config["verification"]> = {}): Config {
  return {
    verification: {
      required: true,
      secret: "operator-secret",
      methods: ["dns", "http"],
      cacheTtlSec: 3600,
      ...overrides,
    },
  } as unknown as Config;
}

describe("expectedToken", () => {
  it("is deterministic for the same secret + host", () => {
    expect(expectedToken("s", "example.com")).toBe(expectedToken("s", "example.com"));
  });
  it("is 64 hex chars (HMAC-SHA256)", () => {
    expect(expectedToken("s", "example.com")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differs by host", () => {
    expect(expectedToken("s", "a.com")).not.toBe(expectedToken("s", "b.com"));
  });
  it("differs by secret — nobody without the secret can compute a host's token", () => {
    expect(expectedToken("s1", "a.com")).not.toBe(expectedToken("s2", "a.com"));
  });
  it("is case-insensitive on host", () => {
    expect(expectedToken("s", "EXAMPLE.com")).toBe(expectedToken("s", "example.com"));
  });
});

describe("verificationInstructions", () => {
  it("names the DNS TXT record and embeds the token", () => {
    const ins = verificationInstructions("s", "example.com");
    expect(ins.dns.record).toBe(`${DNS_PREFIX}.example.com`);
    expect(ins.dns.value).toContain(ins.token);
    expect(ins.http.url).toContain(ins.token);
    expect(ins.http.url).toContain("/.well-known/vidence-verify/");
  });
});

describe("makeVerifier", () => {
  const token = (secret: string, host: string) => expectedToken(secret, host);

  it("disabled when verification.required is false", async () => {
    const v = makeVerifier(cfg({ required: false }));
    const r = await v.verify("anything.com");
    expect(r.verified).toBe(true);
    expect(r.method).toBe("disabled");
  });

  it("refuses when required but no secret is configured", async () => {
    const v = makeVerifier(cfg({ secret: "" }));
    const r = await v.verify("example.com");
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/secret/i);
  });

  it("verifies via DNS when the TXT record carries the token", async () => {
    const deps: VerifierDeps = {
      resolveTxt: async (name) => {
        expect(name).toBe(`${DNS_PREFIX}.example.com`);
        return [["vidence-verify=" + token("operator-secret", "example.com")]];
      },
    };
    const r = await makeVerifier(cfg(), deps).verify("https://example.com/some/path");
    expect(r.verified).toBe(true);
    expect(r.method).toBe("dns");
  });

  it("falls back to HTTP when DNS has no record", async () => {
    const deps: VerifierDeps = {
      resolveTxt: async () => {
        throw new Error("ENOTFOUND");
      },
      fetchUrl: async (url) => ({
        ok: true,
        status: 200,
        body: token("operator-secret", "example.com"),
        redirected: false,
      }),
    };
    const r = await makeVerifier(cfg(), deps).verify("example.com");
    expect(r.verified).toBe(true);
    expect(r.method).toBe("http");
  });

  it("stays unverified when neither DNS nor HTTP proves control", async () => {
    const deps: VerifierDeps = {
      resolveTxt: async () => [["some-other-record"]],
      fetchUrl: async () => ({ ok: false, status: 404, body: "", redirected: false }),
    };
    const r = await makeVerifier(cfg(), deps).verify("victim.com");
    expect(r.verified).toBe(false);
  });

  it("rejects an HTTP proof that arrived via a redirect", async () => {
    const deps: VerifierDeps = {
      resolveTxt: async () => {
        throw new Error("ENOTFOUND");
      },
      // Attacker 302s the well-known path to a page that echoes the token.
      fetchUrl: async () => ({
        ok: true,
        status: 200,
        body: token("operator-secret", "victim.com"),
        redirected: true,
      }),
    };
    const r = await makeVerifier(cfg(), deps).verify("victim.com");
    expect(r.verified).toBe(false);
  });

  it("only consults the methods that are enabled", async () => {
    let httpCalled = false;
    const deps: VerifierDeps = {
      resolveTxt: async () => [["no-match"]],
      fetchUrl: async () => {
        httpCalled = true;
        return { ok: true, status: 200, body: "", redirected: false };
      },
    };
    const r = await makeVerifier(cfg({ methods: ["dns"] }), deps).verify("example.com");
    expect(r.verified).toBe(false);
    expect(httpCalled).toBe(false);
  });

  it("briefly caches a negative result (no DNS/HTTP probe storm on a retry loop)", async () => {
    let dns = 0;
    let http = 0;
    const deps: VerifierDeps = {
      resolveTxt: async () => {
        dns++;
        return [["no-match"]];
      },
      fetchUrl: async () => {
        http++;
        return { ok: false, status: 404, body: "", redirected: false };
      },
      now: () => 1000,
    };
    const v = makeVerifier(cfg(), deps);
    const a = await v.verify("example.com");
    const b = await v.verify("example.com");
    expect(a.verified).toBe(false);
    expect(b.verified).toBe(false);
    expect(dns).toBe(1); // second call served from the negative cache
    expect(http).toBe(2); // one probe each for https + http on the first call only
  });

  it("caches a positive result within the TTL (no repeat DNS lookup)", async () => {
    let calls = 0;
    const deps: VerifierDeps = {
      resolveTxt: async () => {
        calls++;
        return [["vidence-verify=" + token("operator-secret", "example.com")]];
      },
      now: () => 1000,
    };
    const v = makeVerifier(cfg(), deps);
    await v.verify("example.com");
    await v.verify("example.com");
    expect(calls).toBe(1);
  });
});
