import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { load } from "./load.js";

const fixture = fileURLToPath(new URL("__fixtures__/clear-break.mp3", import.meta.url));
const hasFfprobe = hasBinary("ffprobe");

describe("load", () => {
  it.skipIf(!hasFfprobe)("loads AudioTrack metadata through ffprobe", async () => {
    const track = await load(fixture);

    expect(track.path).toBe(fixture);
    expect(track.duration_s).toBeCloseTo(4, 0.1);
    expect(track.sample_rate).toBe(44100);
    expect(track.channels).toBe(1);
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
