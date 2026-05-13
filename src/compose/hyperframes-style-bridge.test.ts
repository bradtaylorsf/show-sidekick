import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { playbookToCssVariables, writeCssVarsFile } from "./hyperframes-style-bridge.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("hyperframes style bridge", () => {
  it("translates playbook palette, typography, motion, and captions to CSS variables", () => {
    expect(playbookToCssVariables(playbook())).toEqual({
      "--brand-accent": "#a3e635",
      "--brand-background": "#07111f",
      "--brand-primary": "#2dd4bf",
      "--brand-secondary": "#f59e0b",
      "--brand-surface": "#0f1d32",
      "--brand-text": "#f8fafc",
      "--caption-active-fill": "#2dd4bf",
      "--caption-fill": "#f8fafc",
      "--caption-font": "Inter",
      "--caption-stroke": "#020617",
      "--font-body": "Inter",
      "--font-display": "Inter Tight",
      "--motion-ease": "cubic-bezier(.2,.8,.2,1)",
      "--motion-fast": "180ms",
      "--motion-medium": "360ms",
      "--motion-transition-allowlist": "cut,slide",
      "--type-body-size": "34px",
      "--type-title-size": "88px",
    });
  });

  it("writes sorted :root CSS variables", async () => {
    const dir = await mkdtemp(join(tmpdir(), "predit-style-bridge-test-"));
    tempDirs.push(dir);
    const outPath = join(dir, "hyperframes.css");

    await writeCssVarsFile({ "--z": "last", "--a": "first" }, outPath);

    await expect(readFile(outPath, "utf8")).resolves.toBe(":root {\n  --a: first;\n  --z: last;\n}\n");
  });
});

function playbook() {
  return {
    palette: {
      accent: "#a3e635",
      background: "#07111f",
      primary: "#2dd4bf",
      secondary: "#f59e0b",
      surface: "#0f1d32",
      text: "#f8fafc",
    },
    typography: {
      body: "Inter",
      display: "Inter Tight",
      body_size: 34,
      title_size: 88,
    },
    motion: {
      allowed_transitions: ["cut", "slide"],
      ease: "cubic-bezier(.2,.8,.2,1)",
      fast_ms: 180,
      medium_ms: 360,
    },
    caption_style: {
      active_fill: "#2dd4bf",
      fill: "#f8fafc",
      font_family: "Inter",
      stroke: "#020617",
    },
  };
}
