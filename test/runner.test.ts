import { describe, it, expect } from "vitest";
import { makeDockerRunner, type ExecOpts } from "../src/runner.js";
import type { ExecResult } from "../src/exec.js";
import type { Config } from "../src/config.js";

// Minimal config for the docker adapter: it only reads cfg.runner.*.
function dockerCfg(autostart = false): Config {
  return {
    runner: {
      mode: "docker",
      container: "vidence-kali",
      dockerPath: "docker",
      image: "ghcr.io/example/img:latest",
      autostart,
    },
  } as unknown as Config;
}

// autostart:false keeps ensureReady inert so the not-ready path never shells
// out to a real docker daemon during the default tests.
const cfg = dockerCfg(false);

const opts: ExecOpts = { timeoutMs: 1000, maxBytes: 1024 };

/** A fake exec primitive that records its calls and returns a canned result. */
function fakeRun(result: ExecResult) {
  const calls: { binary: string; args: string[] }[] = [];
  const run = (binary: string, args: string[]) => {
    calls.push({ binary, args });
    return Promise.resolve(result);
  };
  return { run, calls };
}

describe("DockerRunner.exec", () => {
  it("wraps the command in `docker exec <container> …` and returns the result", async () => {
    const ok: ExecResult = { stdout: "PORT 80/tcp open", stderr: "", code: 0, timedOut: false };
    const { run, calls } = fakeRun(ok);
    const runner = makeDockerRunner(cfg, run);

    const res = await runner.exec("nmap", ["-sV", "scanme.example.com"], opts);

    expect(calls).toHaveLength(1);
    expect(calls[0].binary).toBe("docker");
    expect(calls[0].args).toEqual(["exec", "vidence-kali", "nmap", "-sV", "scanme.example.com"]);
    expect(res).toEqual(ok);
  });

  it("turns a 'no such container' failure into a friendly not-ready message (autostart on)", async () => {
    const notReady: ExecResult = {
      stdout: "",
      stderr: "Error: No such container: vidence-kali",
      code: 1,
      timedOut: false,
    };
    const { run } = fakeRun(notReady);
    const runner = makeDockerRunner(dockerCfg(true), run);

    const res = await runner.exec("nmap", ["-sV", "scanme.example.com"], opts);

    expect(res.code).toBe(0);
    expect(res.stdout).toContain("isn't ready yet");
    expect(res.stderr).toBe("");
  });

  it("tells the truth when the host is down and autostart is off (won't claim a restart)", async () => {
    const notReady: ExecResult = { stdout: "", stderr: "Error: No such container: vidence-kali", code: 1, timedOut: false };
    const { run } = fakeRun(notReady);
    const runner = makeDockerRunner(dockerCfg(false), run);

    const res = await runner.exec("nmap", ["-sV", "scanme.example.com"], opts);

    expect(res.stdout).toContain("autostart is off");
    expect(res.stdout).not.toContain("(re)started now");
  });

  it("re-provisions a container that died after a successful start (autostart on)", async () => {
    // First a successful run makes the adapter consider itself ready; then the
    // container vanishes. The next exec must actually re-run provisioning
    // instead of short-circuiting on a stale ready latch.
    const seen: string[][] = [];
    const run = (_binary: string, args: string[]) => {
      seen.push(args);
      if (args[0] === "exec") {
        return Promise.resolve<ExecResult>({ stdout: "", stderr: "Error: No such container: vidence-kali", code: 1, timedOut: false });
      }
      // Provisioning probes (version/inspect/pull/…): fail benignly so the
      // sequence stops early — we only assert that it was attempted.
      return Promise.resolve<ExecResult>({ stdout: "", stderr: "", code: 1, timedOut: false });
    };
    const runner = makeDockerRunner(dockerCfg(true), run);

    const res = await runner.exec("nmap", ["-sV", "scanme.example.com"], opts);
    expect(res.stdout).toContain("(re)started now");

    // Flush the fire-and-forget ensureReady() microtasks.
    await new Promise((r) => setImmediate(r));
    expect(seen.some((a) => a[0] === "version")).toBe(true); // provisioning actually ran
  });

  it("passes other failures through untouched", async () => {
    const realFailure: ExecResult = { stdout: "", stderr: "nmap: bad flag", code: 2, timedOut: false };
    const { run } = fakeRun(realFailure);
    const runner = makeDockerRunner(cfg, run);

    const res = await runner.exec("nmap", ["--nope"], opts);

    expect(res).toEqual(realFailure);
  });
});
