import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { checkScope } from "./scope.js";
import { run } from "./exec.js";
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

export function buildServer(cfg: Config): McpServer {
  const server = new McpServer({ name: "vidence-recon-mcp", version: "0.1.0" });

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
        ].join("\n"),
      ),
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

        // 2. Scope gate.
        const target = String(input[spec.targetField] ?? "");
        if (!target) return text(`Refused: missing '${spec.targetField}'.`);
        const scope = await checkScope(target, cfg.scope.allowedTargets);
        if (!scope.authorized) return text(`Refused (out of scope): ${scope.reason}`);

        // 3. Build args; screen any extra args.
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

        // 4. Run.
        await rateGate(cfg.safety.minIntervalMs);
        const binary = cfg.tools[spec.binaryKey] || spec.binary;
        const timeoutMs = (spec.timeoutSec ?? cfg.limits.commandTimeoutSec) * 1000;
        const res = await run(binary, args, { timeoutMs, maxBytes: cfg.limits.maxOutputBytes });

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
