import { afterEach, describe, expect, it, vi } from "vitest";
import { configure, resetLoggerMode } from "./mode.js";
import { debug, error, event, info, warn } from "./logger.js";

const ansiPattern = /\u001b\[/u;

function captureWrites(stream: NodeJS.WriteStream) {
  const writes: string[] = [];
  const spy = vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });

  return { writes, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
  resetLoggerMode();
});

describe("logger", () => {
  it("keeps stdout as parseable NDJSON events in json mode", () => {
    const stdout = captureWrites(process.stdout);
    const stderr = captureWrites(process.stderr);
    configure({ json: true, verbose: true });

    info("ready", { subsystem: "test" });
    warn("careful");
    event("checkpoint", { ok: true });

    for (const line of stdout.writes) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(stdout.writes).toHaveLength(1);
    expect(JSON.parse(stdout.writes[0] ?? "{}")).toMatchObject({ level: "event", name: "checkpoint" });
    expect(stderr.writes).toHaveLength(2);
    expect(stderr.writes.join("")).toContain("ready");
    expect(stderr.writes.join("")).toContain("careful");
  });

  it("emits error and verbose debug NDJSON to stderr in json mode", () => {
    const stdout = captureWrites(process.stdout);
    const stderr = captureWrites(process.stderr);
    configure({ json: true, verbose: true });

    error("failed");
    debug("trace");

    expect(stdout.writes).toHaveLength(0);
    expect(stderr.writes).toHaveLength(2);
    expect(JSON.parse(stderr.writes[0] ?? "{}")).toMatchObject({ level: "error", msg: "failed" });
    expect(JSON.parse(stderr.writes[1] ?? "{}")).toMatchObject({ level: "debug", msg: "trace" });
  });

  it("suppresses debug unless verbose is enabled", () => {
    const stderr = captureWrites(process.stderr);
    configure({ verbose: false });

    debug("hidden");

    expect(stderr.writes).toHaveLength(0);
  });

  it("strips ANSI codes when color is disabled", () => {
    const stdout = captureWrites(process.stdout);
    configure({ color: false });

    info("plain");

    expect(stdout.writes.join("")).not.toMatch(ansiPattern);
  });
});
