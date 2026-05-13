import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ffprobe } from "./ffprobe.js";

const fixture = fileURLToPath(new URL("__fixtures__/clear-break.mp3", import.meta.url));
const hasFfprobe = hasBinary("ffprobe");

describe("ffprobe", () => {
  it.skipIf(!hasFfprobe)("returns parsed JSON for fixture media", async () => {
    const result = await ffprobe(fixture);
    const audioStream = result.streams?.find((stream) => stream.codec_type === "audio");

    expect(Number(result.format?.duration)).toBeGreaterThan(3.9);
    expect(audioStream).toBeDefined();
    expect(audioStream?.sample_rate).toBe("44100");
  });
});

function hasBinary(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
