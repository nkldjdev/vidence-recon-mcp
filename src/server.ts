import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import type { Runner } from "./runner.js";
import type { Verifier } from "./verify.js";
import { checkScope, extractHost } from "./scope.js";
import { verificationInstructions } from "./verify.js";
import { TOOLS } from "./tools/specs.js";
import { PLAYBOOKS } from "./playbooks.js";
import {
  isTierAllowed,
  tierRefusalMessage,
  screenExtraArgs,
  SAFETY_BANNER,
} from "./safety.js";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

let lastRun = 0;
async function rateGate(minIntervalMs: number) {
  if (minIntervalMs <= 0) return;
  const wait = lastRun + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRun = Date.now();
}

export function buildServer(cfg: Config, runner: Runner, verifier: Verifier): McpServer {
  const server = new McpServer({ name: "vidence-recon-mcp", version: "0.1.2" });

  // Introspection tool: what's authorized right now.
  server.tool(
    "scope",
    "Show the currently authorized target scope and which safety tiers are enabled.",
    {},
    async () =>
      text(
        [
          SAFETY_BANNER,
          "",
          `Authorized targets: ${cfg.scope.allowedTargets.length ? cfg.scope.allowedTargets.join(", ") : "(none — set scope.allowedTargets)"}`,
          `Tiers enabled: safe=always, active=${cfg.safety.allowActive}, intrusive=${cfg.safety.allowIntrusive}`,
          `Raw extra-args passthrough: ${cfg.safety.allowRawArgs}`,
          `Ownership verification: required=${cfg.verification.required}` +
            (cfg.verification.required
              ? `, methods=${cfg.verification.methods.join("/")}, secret ${cfg.verification.secret ? "set" : "NOT set — run 'verify'"}`
              : " (DISABLED — allowlisted targets are trusted on assertion)"),
        ].join("\n"),
      ),
  );

  // Setup tool: prove you control a target so tools may run against it. This is
  // the easy, safe on-ramp to the lockdown — it prints the exact challenge to
  // publish and reports live verification status.
  server.tool(
    "verify",
    "Prove ownership of a target so tools may run against it. Shows the DNS TXT / HTTP challenge to publish and checks current status.",
    { target: z.string().describe("domain or host you want to authorize, e.g. example.com") },
    async ({ target }) => {
      const host = extractHost(String(target));
      if (!cfg.verification.required) {
        return text(
          `Ownership verification is DISABLED (verification.required=false). Allowlisted targets are testable without proof. Set it to true to require proven ownership.`,
        );
      }
      if (!cfg.verification.secret) {
        return text(
          [
            "No verification.secret is set — ownership can't be proven yet.",
            "",
            "Generate a stable, private secret once and keep it (treat it like a password):",
            `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
            "",
            "Then set it via VIDENCE_RECON_MCP_VERIFY_SECRET (or verification.secret in config.json) and re-run verify.",
          ].join("\n"),
        );
      }
      const ins = verificationInstructions(cfg.verification.secret, host);
      const status = await verifier.verify(host);
      return text(
        [
          `Ownership verification for ${ins.host}`,
          status.verified
            ? `✅ VERIFIED via ${status.method} — tools may run against ${ins.host}.`
            : `❌ NOT YET VERIFIED — publish ONE of these, then re-run verify:`,
          "",
          "DNS (recommended):",
          `  ${ins.dns.record}  TXT  "${ins.dns.value}"`,
          "",
          "HTTP (alternative) — serve this exact URL returning 200, no redirect, body containing the token:",
          `  ${ins.http.url}`,
          "",
          `This token is unique to your secret + ${ins.host}; nobody without your secret can compute it, and you can only publish it on a host you control.`,
        ].join("\n"),
      );
    },
  );

  // Register every tool spec uniformly, with scope + safety + arg screening.
  for (const spec of TOOLS) {
    server.tool(
      spec.name,
      `[${spec.safety}] ${spec.description}`,
      spec.input.shape,
      async (input: Record<string, unknown>) => {
        // 1. Safety tier gate.
        if (!isTierAllowed(spec.safety, cfg.safety)) {
          return text(`Refused: ${tierRefusalMessage(spec.safety)}`);
        }

        // 2. Scope gate — the target must be in the operator's declared scope.
        const target = String(input[spec.targetField] ?? "");
        if (!target) return text(`Refused: missing '${spec.targetField}'.`);
        const scope = await checkScope(target, cfg.scope.allowedTargets);
        if (!scope.authorized) return text(`Refused (out of scope): ${scope.reason}`);

        // 3. Ownership gate — and the operator must have PROVEN they control it.
        //    This is the lockdown: being in scope is an assertion; verification
        //    is proof. No proof, no tool. (Use the 'verify' tool to set it up.)
        const ownership = await verifier.verify(target);
        if (!ownership.verified) return text(`Refused (unverified target): ${ownership.reason}`);

        // 4. Build args; screen any extra args.
        let args: string[];
        try {
          args = spec.buildArgs(input);
        } catch (e) {
          return text(`Bad input: ${(e as Error).message}`);
        }
        const extra = Array.isArray(input.extraArgs) ? (input.extraArgs as string[]) : [];
        if (extra.length) {
          if (!cfg.safety.allowRawArgs) {
            return text("Refused: extraArgs supplied but config.safety.allowRawArgs is false.");
          }
          const screen = screenExtraArgs(extra, spec.blockedFlags ?? []);
          if (!screen.ok) return text(`Refused: flag '${screen.offending}' is blocklisted for safety.`);
          args = [...args, ...extra];
        }

        // 5. Resolve the binary (config override wins) and run it through the
        //    configured runner. The runner hides whether that's a direct local
        //    binary or a `docker exec` into the Kali tool host.
        await rateGate(cfg.safety.minIntervalMs);
        const binary = cfg.tools[spec.binaryKey] || spec.binary;
        const timeoutMs = (spec.timeoutSec ?? cfg.limits.commandTimeoutSec) * 1000;
        const res = await runner.exec(binary, args, { timeoutMs, maxBytes: cfg.limits.maxOutputBytes });

        const header = `$ ${binary} ${args.join(" ")}\n(scope: ${scope.reason})\n`;
        if (res.timedOut) return text(`${header}\n[timed out after ${timeoutMs / 1000}s]\n${res.stdout}`);
        const body = res.stdout || res.stderr || `[no output, exit ${res.code}]`;
        return text(`${header}\n${body}`);
      },
    );
  }

  // Register playbooks as MCP prompts.
  for (const pb of PLAYBOOKS) {
    const argShape: Record<string, z.ZodString> = {};
    for (const a of pb.args) argShape[a.name] = z.string().describe(a.description);
    server.prompt(pb.name, pb.description, argShape, (args: Record<string, string>) => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: pb.render(args) },
        },
      ],
    }));
  }

  return server;
}
