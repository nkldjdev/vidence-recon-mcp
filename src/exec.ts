import { execFile } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/**
 * Run a binary with an explicit argv array and NO shell. Because no shell is
 * involved, argument values cannot inject extra commands (no globbing, no
 * `;`, `&&`, backticks). Output is capped and the process is killed on timeout.
 */
export function run(
  binary: string,
  args: string[],
  opts: { timeoutMs: number; maxBytes: number },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      binary,
      args,
      {
        timeout: opts.timeoutMs,
        maxBuffer: opts.maxBytes,
        windowsHide: true,
        // Explicitly no `shell` option -> execFile does not spawn a shell.
      },
      (err, stdout, stderr) => {
        const anyErr = err as
          | (NodeJS.ErrnoException & { killed?: boolean; code?: number | string; signal?: string })
          | null;
        const timedOut = Boolean(anyErr && anyErr.killed && anyErr.signal === "SIGTERM");
        if (anyErr && anyErr.code === "ENOENT") {
          resolve({
            stdout: "",
            stderr: `Binary '${binary}' not found on PATH. Install it or set its path in config.tools.`,
            code: 127,
            timedOut: false,
          });
          return;
        }
        resolve({
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          code: typeof anyErr?.code === "number" ? anyErr.code : err ? 1 : 0,
          timedOut,
        });
      },
    );
    child.on("error", () => {
      /* handled in callback */
    });
  });
}
