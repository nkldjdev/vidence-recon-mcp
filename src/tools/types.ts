import { z } from "zod";
import type { SafetyLevel } from "../safety.js";

/**
 * A tool is declared, not hand-wired. Add a new tool = add a ToolSpec to
 * specs.ts. The server registers each spec as an MCP tool with the scope guard,
 * safety gating, and extra-arg screening applied uniformly. This is the seam
 * the community extends.
 */
export interface ToolSpec {
  /** MCP tool name, e.g. "nmap_scan". */
  name: string;
  /** One-line description shown to the model. */
  description: string;
  /** Binary to invoke (overridable via config.tools[binaryKey]). */
  binary: string;
  /** Key used to look up an override path in config.tools. */
  binaryKey: string;
  safety: SafetyLevel;
  /** Zod shape for the structured inputs. Must include a target/url string. */
  input: z.ZodObject<z.ZodRawShape>;
  /** Which input field holds the target to scope-check. */
  targetField: string;
  /** Build argv (excluding the binary) from validated input. */
  buildArgs: (input: Record<string, unknown>) => string[];
  /** Extra flags never allowed for THIS tool (added to the global blocklist). */
  blockedFlags?: string[];
  /** Per-tool timeout override, seconds. */
  timeoutSec?: number;
}
