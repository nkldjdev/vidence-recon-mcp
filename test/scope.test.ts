import { describe, it, expect } from "vitest";
import { extractHost, checkScope } from "../src/scope.js";

describe("extractHost", () => {
  it("strips scheme, path, query", () => {
    expect(extractHost("https://example.com:443/path?q=1")).toBe("example.com");
  });
  it("strips userinfo before port", () => {
    const at = String.fromCharCode(64);
    expect(extractHost(`http://user:pass${at}host.example.com:8443/x`)).toBe("host.example.com");
  });
  it("handles bare host:port", () => {
    expect(extractHost("10.0.0.5:22")).toBe("10.0.0.5");
  });
  it("handles IPv6 in brackets", () => {
    expect(extractHost("https://[2001:db8::1]:8443/x")).toBe("2001:db8::1");
  });
});

describe("checkScope", () => {
  it("refuses when allowlist is empty", async () => {
    const r = await checkScope("127.0.0.1", []);
    expect(r.authorized).toBe(false);
  });
  it("allows a literal match", async () => {
    const r = await checkScope("scanme.nmap.org/path", ["scanme.nmap.org"]);
    expect(r.authorized).toBe(true);
  });
  it("allows an IP inside a CIDR", async () => {
    const r = await checkScope("10.0.0.42", ["10.0.0.0/24"]);
    expect(r.authorized).toBe(true);
  });
  it("refuses an IP outside a CIDR", async () => {
    const r = await checkScope("10.0.1.42", ["10.0.0.0/24"]);
    expect(r.authorized).toBe(false);
  });
  it("refuses a literal localhost not in a numeric allowlist", async () => {
    const r = await checkScope("127.0.0.1", ["10.0.0.0/24"]);
    expect(r.authorized).toBe(false);
  });
});
