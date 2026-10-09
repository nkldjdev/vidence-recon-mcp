import { z } from "zod";
import type { ToolSpec } from "./types.js";

const extraArgs = z
  .array(z.string())
  .optional()
  .describe("Advanced: extra CLI flags. Ignored unless config.safety.allowRawArgs is true; screened against the blocklist.");

/**
 * The tool catalogue. Detection / recon / scanning oriented by design.
 * Exploitation and post-exploitation are intentionally NOT included
 * (see DISCLAIMER.md and README "Scope & philosophy").
 */
export const TOOLS: ToolSpec[] = [
  // ---- SAFE: read-only recon -------------------------------------------------
  {
    name: "http_headers",
    description: "Fetch HTTP response headers for a URL (curl -I). Safe, read-only.",
    binary: "curl",
    binaryKey: "curl",
    safety: "safe",
    input: z.object({ url: z.string().describe("Target URL, e.g. https://example.com") }),
    targetField: "url",
    buildArgs: (i) => ["-sSI", "--max-time", "30", String(i.url)],
  },
  {
    name: "whatweb",
    description: "Fingerprint web technologies (server, framework, CMS) on a URL. Safe.",
    binary: "whatweb",
    binaryKey: "whatweb",
    safety: "safe",
    input: z.object({ url: z.string().describe("Target URL") }),
    targetField: "url",
    // A real browser User-Agent so WAFs (Cloudflare, etc.) don't blackhole the
    // default whatweb UA and return an empty result.
    buildArgs: (i) => [
      "--color=never",
      "--no-errors",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      String(i.url),
    ],
  },
  {
    name: "dns_enum",
    description: "Resolve DNS records (A/AAAA/MX/TXT/NS) for a domain via dig. Safe.",
    binary: "dig",
    binaryKey: "dig",
    safety: "safe",
    input: z.object({ domain: z.string().describe("Domain, e.g. example.com") }),
    targetField: "domain",
    // Use dig (from dnsutils) instead of dnsx: the dnsx apt package shipped a
    // broken/mismatched binary ("exec format error"). dig is always present and
    // reliable. One batched query returns A/AAAA/MX/NS/TXT in a single call.
    buildArgs: (i) => {
      const d = String(i.domain);
      return ["+noall", "+answer", d, "A", d, "AAAA", d, "MX", d, "NS", d, "TXT"];
    },
  },
  {
    name: "tls_scan",
    description: "Check TLS/SSL configuration and certificate of a host:port with sslscan. Safe.",
    binary: "sslscan",
    binaryKey: "sslscan",
    safety: "safe",
    input: z.object({
      target: z.string().describe("host or host:port, e.g. example.com:443"),
    }),
    targetField: "target",
    buildArgs: (i) => ["--no-colour", String(i.target)],
  },

  // ---- ACTIVE: scanning that sends notable traffic ---------------------------
  {
    name: "nmap_scan",
    description: "Port & service/version scan with nmap. Active: sends probe traffic.",
    binary: "nmap",
    binaryKey: "nmap",
    safety: "active",
    input: z.object({
      target: z.string().describe("host or IP (must be in scope)"),
      ports: z.string().optional().describe('port spec, e.g. "80,443" or "1-1000"'),
      serviceDetection: z.boolean().optional().describe("run -sV service/version detection (default true)"),
      extraArgs,
    }),
    targetField: "target",
    blockedFlags: ["--script"], // keep NSE off the easy path; opt in via a future dedicated tool
    buildArgs: (i) => {
      const args = ["-T4"];
      if (i.serviceDetection !== false) args.push("-sV");
      if (i.ports) args.push("-p", String(i.ports));
      args.push(String(i.target));
      return args;
    },
  },
  {
    name: "nikto_scan",
    description: "Scan a web server for known issues/misconfigurations with nikto. Active.",
    binary: "nikto",
    binaryKey: "nikto",
    safety: "active",
    input: z.object({
      target: z.string().describe("host or IP"),
      port: z.string().optional().describe("port, default 80"),
    }),
    targetField: "target",
    timeoutSec: 600,
    buildArgs: (i) => ["-host", String(i.target), "-port", String(i.port ?? "80"), "-maxtime", "300s", "-nointeractive"],
  },
  {
    name: "nuclei_scan",
    description: "Run ProjectDiscovery Nuclei templates (CVEs, exposures, misconfigs) against a URL. Active.",
    binary: "nuclei",
    binaryKey: "nuclei",
    safety: "active",
    input: z.object({
      url: z.string().describe("Target URL"),
      severity: z.string().optional().describe('comma list, e.g. "critical,high,medium"'),
      tags: z.string().optional().describe('template tags, e.g. "cve,exposure,misconfig"'),
      extraArgs,
    }),
    targetField: "url",
    timeoutSec: 900,
    buildArgs: (i) => {
      const args = ["-u", String(i.url), "-silent", "-no-color"];
      if (i.severity) args.push("-severity", String(i.severity));
      if (i.tags) args.push("-tags", String(i.tags));
      return args;
    },
  },
  {
    name: "dir_bruteforce",
    description: "Discover hidden paths/files on a web server with gobuster (dir mode). Active.",
    binary: "gobuster",
    binaryKey: "gobuster",
    safety: "active",
    input: z.object({
      url: z.string().describe("Base URL"),
      wordlist: z.string().describe("absolute path to a wordlist on the server"),
      extensions: z.string().optional().describe('e.g. "php,txt,bak"'),
    }),
    targetField: "url",
    timeoutSec: 600,
    buildArgs: (i) => {
      const args = ["dir", "-q", "-u", String(i.url), "-w", String(i.wordlist)];
      if (i.extensions) args.push("-x", String(i.extensions));
      return args;
    },
  },
  {
    name: "content_fuzz",
    description: "Fuzz a URL with ffuf using a FUZZ keyword and a wordlist. Active.",
    binary: "ffuf",
    binaryKey: "ffuf",
    safety: "active",
    input: z.object({
      url: z.string().describe('URL containing the FUZZ keyword, e.g. https://host/FUZZ'),
      wordlist: z.string().describe("absolute path to a wordlist on the server"),
      matchCodes: z.string().optional().describe('e.g. "200,204,301,302,401"'),
    }),
    targetField: "url",
    timeoutSec: 600,
    buildArgs: (i) => {
      const args = ["-u", String(i.url), "-w", String(i.wordlist), "-s"];
      if (i.matchCodes) args.push("-mc", String(i.matchCodes));
      return args;
    },
  },
  {
    name: "wpscan",
    description: "Enumerate a WordPress site (version, plugins, themes, users) with wpscan. Active.",
    binary: "wpscan",
    binaryKey: "wpscan",
    safety: "active",
    input: z.object({
      url: z.string().describe("WordPress site URL"),
      enumerate: z.string().optional().describe('what to enumerate, e.g. "vp,vt,u" (vuln plugins/themes, users)'),
    }),
    targetField: "url",
    timeoutSec: 600,
    buildArgs: (i) => {
      const args = ["--url", String(i.url), "--no-banner", "--format", "cli-no-color"];
      if (i.enumerate) args.push("--enumerate", String(i.enumerate));
      return args;
    },
  },

  // ---- INTRUSIVE: off unless allowIntrusive + confirm ------------------------
  {
    name: "sqli_detect",
    description:
      "Detect (NOT exploit) SQL injection on a URL with sqlmap. Intrusive. Detection only — data extraction and OS-takeover flags are blocked.",
    binary: "sqlmap",
    binaryKey: "sqlmap",
    safety: "intrusive",
    input: z.object({
      url: z.string().describe("Target URL with a parameter, e.g. https://host/item?id=1"),
      level: z.number().int().min(1).max(5).optional(),
      risk: z.number().int().min(1).max(3).optional(),
    }),
    targetField: "url",
    timeoutSec: 900,
    // Hard stop on anything that extracts data or takes over the host.
    blockedFlags: [
      "--dump",
      "--dump-all",
      "--os-shell",
      "--os-pwn",
      "--os-cmd",
      "--sql-shell",
      "--file-read",
      "--file-write",
    ],
    buildArgs: (i) => {
      const args = [
        "-u",
        String(i.url),
        "--batch",
        "--smart",
        "--technique=BEUST",
        "--level",
        String(i.level ?? 1),
        "--risk",
        String(i.risk ?? 1),
      ];
      return args;
    },
  },
];
