import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import tool, { buildWhisperArgs, parseWhisperJson } from "./whisper-cpp.js";

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
      reason: "binary not on PATH: whisper-cli or whisper-cpp",
      fix: "install",
    });
  });

  it("reports unavailable with WHISPER_MODEL guidance when the configured model file is missing", async () => {
    const dir = fakeWhisperDir();
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    vi.stubEnv("WHISPER_MODEL", join(dir, "missing", "ggml-base.en.bin"));

    const availability = await tool.isAvailable({ projectRoot: dir });

    expect(availability).toMatchObject({ available: false, fix: "env" });
    expect(availability.available === false && availability.reason).toContain("whisper model file not found");
    expect(availability.available === false && availability.reason).toContain("WHISPER_MODEL=");
  });

  it("is available when whisper-cli is on PATH and WHISPER_MODEL points at a model file", async () => {
    const dir = fakeWhisperDir();
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    vi.stubEnv("WHISPER_MODEL", modelFile(dir, "ggml-base.en.bin"));

    await expect(tool.isAvailable({ projectRoot: dir })).resolves.toEqual({ available: true });
  });

  it("surfaces install guidance when execute cannot spawn whisper-cli", async () => {
    const dir = mkdtempSync(join(tmpdir(), "predit-whisper-missing-"));
    const audioPath = join(dir, "audio.wav");
    writeFileSync(audioPath, "fake audio");
    const model = modelFile(dir, "ggml-medium.en.bin");
    stubMissingBinaryPath();

    await expect(
      tool.execute({ audio_path: audioPath, model }, { projectRoot: dir, logger: captureLogger() }),
    ).rejects.toThrow("whisper-cli binary not on PATH (tried whisper-cli, whisper-cpp). Install: brew install whisper-cpp");
  });

  it("builds argv with no value token after boolean flags", () => {
    const args = buildWhisperArgs({ audio_path: "a.wav", model: "/m/ggml-base.en.bin", language: "en" }, "/t/in.wav", "/t/out");

    expect(args).toEqual([
      "--model",
      "/m/ggml-base.en.bin",
      "--file",
      "/t/in.wav",
      "--output-json-full",
      "--output-file",
      "/t/out",
      "--language",
      "en",
    ]);
    expect(args).not.toContain("false");
    expect(args).not.toContain("--print-progress");
  });

  it("executes whisper-cli with the WHISPER_MODEL path and parses segments", async () => {
    const dir = fakeWhisperDir();
    const argsPath = join(dir, "args.txt");
    const audioPath = join(dir, "audio.wav");
    writeFileSync(audioPath, "fake audio");
    const model = modelFile(join(dir, "home", ".cache", "whisper"), "ggml-base.en.bin");
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    vi.stubEnv("WHISPER_ARGS_FILE", argsPath);
    vi.stubEnv("HOME", join(dir, "home"));
    vi.stubEnv("WHISPER_MODEL", "$HOME/.cache/whisper/ggml-base.en.bin");

    const result = await tool.execute({ audio_path: audioPath, language: "en" }, { projectRoot: dir, logger: captureLogger() });

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
    expect(args.slice(0, 2)).toEqual(["--model", model]);
    expect(args).toEqual(expect.arrayContaining(["--output-json-full", "--language", "en"]));
    expect(args).not.toContain("false");
    expect(args).not.toContain("medium.en");
  });

  it("resolves a bare model name to ggml-<name>.bin in the whisper cache", async () => {
    const dir = fakeWhisperDir();
    const argsPath = join(dir, "args.txt");
    const audioPath = join(dir, "audio.wav");
    writeFileSync(audioPath, "fake audio");
    const model = modelFile(join(dir, "home", ".cache", "whisper"), "ggml-large-v3.bin");
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    vi.stubEnv("WHISPER_ARGS_FILE", argsPath);
    vi.stubEnv("HOME", join(dir, "home"));
    vi.stubEnv("WHISPER_MODEL", "");

    await tool.execute({ audio_path: audioPath, model: "large-v3" }, { projectRoot: dir, logger: captureLogger() });

    expect(readFileSync(argsPath, "utf8").trim().split("\n").slice(0, 2)).toEqual(["--model", model]);
  });

  it("explains how to set WHISPER_MODEL when no model can be resolved", async () => {
    const dir = fakeWhisperDir();
    const audioPath = join(dir, "audio.wav");
    writeFileSync(audioPath, "fake audio");
    vi.stubEnv("PATH", `${dir}:${process.env.PATH ?? ""}`);
    vi.stubEnv("HOME", join(dir, "empty-home"));
    vi.stubEnv("WHISPER_MODEL", "");

    await expect(
      tool.execute({ audio_path: audioPath, model: "medium.en" }, { projectRoot: dir, logger: captureLogger() }),
    ).rejects.toThrow(/whisper model 'medium\.en' not found.*set WHISPER_MODEL/u);
  });

  it("falls back to a whisper-cpp binary when whisper-cli is absent", async () => {
    const dir = fakeWhisperDir("whisper-cpp");
    const argsPath = join(dir, "args.txt");
    const audioPath = join(dir, "audio.wav");
    writeFileSync(audioPath, "fake audio");
    vi.stubEnv("PATH", `${dir}:/usr/bin:/bin`);
    vi.stubEnv("WHISPER_ARGS_FILE", argsPath);
    vi.stubEnv("WHISPER_MODEL", modelFile(dir, "ggml-base.en.bin"));

    const result = await tool.execute({ audio_path: audioPath }, { projectRoot: dir, logger: captureLogger() });

    expect(result.segments[0]?.text).toBe("Hello world");
  });

  it("merges whisper.cpp sub-word tokens into whole words", () => {
    const parsed = parseWhisperJson(
      JSON.stringify({
        transcription: [
          {
            offsets: { from: 0, to: 2000 },
            text: " Hello, everybody",
            tokens: [
              { text: "[_BEG_]", offsets: { from: 0, to: 0 }, p: 0.99 },
              { text: " Hel", offsets: { from: 0, to: 300 }, p: 0.9 },
              { text: "lo", offsets: { from: 300, to: 600 }, p: 0.8 },
              { text: ",", offsets: { from: 600, to: 650 }, p: 0.95 },
              { text: " every", offsets: { from: 700, to: 1200 }, p: 0.97 },
              { text: "body", offsets: { from: 1200, to: 2000 }, p: 0.96 },
              { text: "[_TT_100]", offsets: { from: 2000, to: 2000 }, p: 0.5 },
            ],
          },
        ],
      }),
    );

    expect(parsed.segments[0]?.words).toEqual([
      { text: "Hello,", start_s: 0, end_s: 0.65, confidence: 0.8 },
      { text: "everybody", start_s: 0.7, end_s: 2, confidence: 0.96 },
    ]);
  });
});

/** A temp dir holding a fake whisper.cpp binary that records argv and writes -ojf JSON. */
function fakeWhisperDir(binaryName = "whisper-cli"): string {
  const dir = mkdtempSync(join(tmpdir(), "predit-whisper-test-"));
  const whisperCli = join(dir, binaryName);
  writeFileSync(
    whisperCli,
    `#!/bin/sh
printf '%s\\n' "$@" > "\${WHISPER_ARGS_FILE:-/dev/null}"
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
  return dir;
}

function modelFile(dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, "ggml");
  return file;
}

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
