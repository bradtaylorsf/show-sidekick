import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import tool from "./whisper-cpp.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("whisper-cpp tool", () => {
  it("registers whisper.cpp as a binary integration", () => {
    expect(tool.name).toBe("whisper-cpp");
    expect(tool.capability).toBe("whisper");
    expect(tool.integration).toMatchObject({
      kind: "binary",
      binary: "whisper-cli",
    });
  });

  it("reports unavailable with install guidance when whisper-cli is missing from PATH", async () => {
    stubMissingBinaryPath();

    await expect(tool.isAvailable()).resolves.toEqual({
      available: false,
      reason: "binary not on PATH: whisper-cli",
      fix: "install",
    });
  });

  it("returns a stable availability shape with the current PATH", async () => {
    const availability = await tool.isAvailable();

    if (availability.available) {
      expect(availability).toEqual({ available: true });
    } else {
      expect(availability).toEqual({
        available: false,
        reason: "binary not on PATH: whisper-cli",
        fix: "install",
      });
    }
  });

  it("executes whisper-cli with JSON word-timing output and parses segments", async () => {
    const dir = mkdtempSync(join(tmpdir(), "predit-whisper-test-"));
    const argsPath = join(dir, "args.txt");
    const audioPath = join(dir, "audio.wav");
    const whisperCli = join(dir, "whisper-cli");
    writeFileSync(audioPath, "fake audio");
    writeFileSync(
      whisperCli,
      `#!/bin/sh
printf '%s\\n' "$@" > "$WHISPER_ARGS_FILE"
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-file" ]; then
    out="$2"
    shift 2
  else
    shift
  fi
done
cat > "$out.json" <<'JSON'
{
  "transcription": [
    {
      "offsets": { "from": 0, "to": 1800 },
      "text": " Hello world",
      "tokens": [
        { "text": " Hello", "offsets": { "from": 0, "to": 800 }, "p": 0.93 },
        { "text": " world", "offsets": { "from": 800, "to": 1800 }, "p": 0.88 }
      ]
    }
  ]
}
JSON
`,
    );
    chmodSync(whisperCli, 0o755);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    vi.stubEnv("WHISPER_ARGS_FILE", argsPath);

    const result = await tool.execute(
      { audio_path: audioPath, language: "en", model: "medium.en" },
      { projectRoot: dir, logger: captureLogger() },
    );

    expect(result.segments).toEqual([
      {
        start_s: 0,
        end_s: 1.8,
        text: "Hello world",
        words: [
          { text: "Hello", start_s: 0, end_s: 0.8, confidence: 0.93 },
          { text: "world", start_s: 0.8, end_s: 1.8, confidence: 0.88 },
        ],
      },
    ]);

    const args = readFileSync(argsPath, "utf8").trim().split("\n");
    expect(args).toEqual(expect.arrayContaining(["--model", "medium.en", "--output-json-full", "--output-words"]));
    expect(args).toEqual(expect.arrayContaining(["--print-progress", "false", "--language", "en"]));
  });
});

function stubMissingBinaryPath(): void {
  const dir = mkdtempSync(join(tmpdir(), "predit-tool-missing-"));
  const which = join(dir, "which");
  writeFileSync(which, "#!/bin/sh\nexit 1\n");
  chmodSync(which, 0o755);
  vi.stubEnv("PATH", dir);
}

function captureLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    event() {},
  };
}
