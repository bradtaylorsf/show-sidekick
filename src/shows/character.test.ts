import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../config/errors.js";
import { resolveCharacter } from "./character.js";
import { loadShow } from "./load.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-character-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("character resolver", () => {
  it("resolves character info with absolute reference paths and optional sheet content", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    await writeCharacter(root, "music-videos", "host-mc", {
      sheet: "# Host MC\n\nVisual notes.\n",
      references: [
        "  - path: ./references/portrait.png",
        "    role: portrait",
        "  - path: ../shared/full-body.png",
      ],
    });
    const show = await loadShow(root, "music-videos");

    const character = await resolveCharacter(show, "host-mc");

    const characterDir = path.join(root, "shows", "music-videos", "characters", "host-mc");
    expect(character).toMatchObject({
      slug: "host-mc",
      voice_id: "voice-host-mc",
      visual_description: "A grounded host with a neon jacket.",
      persona: "Focused but warm.",
      charactersDir: path.join(root, "shows", "music-videos", "characters"),
      characterDir,
      references: [
        {
          path: path.join(characterDir, "references", "portrait.png"),
          role: "portrait",
        },
        {
          path: path.join(root, "shows", "music-videos", "characters", "shared", "full-body.png"),
        },
      ],
      referencesPaths: [
        path.join(characterDir, "references", "portrait.png"),
        path.join(root, "shows", "music-videos", "characters", "shared", "full-body.png"),
      ],
      characterSheet: "# Host MC\n\nVisual notes.\n",
    });
  });

  it("rejects case mismatches and lists available characters", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    await writeCharacter(root, "music-videos", "Hero");
    await writeCharacter(root, "music-videos", "sidekick");
    const show = await loadShow(root, "music-videos");

    await expect(resolveCharacter(show, "hero")).rejects.toThrow(
      `character 'hero' not found in ${path.join(root, "shows", "music-videos", "characters")}; available: Hero, sidekick`,
    );
  });

  it("does not treat underscores and dashes as interchangeable", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    await writeCharacter(root, "music-videos", "host_mc");
    const show = await loadShow(root, "music-videos");

    await expect(resolveCharacter(show, "host-mc")).rejects.toThrow("available: host_mc");
  });

  it("surfaces ConfigError with the expected character.yaml path when missing", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    const characterDir = path.join(root, "shows", "music-videos", "characters", "host-mc");
    await mkdir(characterDir, { recursive: true });
    const show = await loadShow(root, "music-videos");

    await expect(resolveCharacter(show, "host-mc")).rejects.toMatchObject({
      name: "ConfigError",
      filePath: path.join(characterDir, "character.yaml"),
    });
  });

  it("throws ConfigError when show.characters is not configured", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos", { includeCharacters: false });
    const show = await loadShow(root, "music-videos");

    await expect(resolveCharacter(show, "host-mc")).rejects.toBeInstanceOf(ConfigError);
    await expect(resolveCharacter(show, "host-mc")).rejects.toMatchObject({
      filePath: path.join(show.rootDir, "show.yaml"),
      issues: [{ path: "characters", message: "show.characters is required to resolve characters" }],
    });
  });
});

async function writeShow(
  root: string,
  slug: string,
  options: { includeCharacters?: boolean } = {},
): Promise<void> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(showDir, { recursive: true });
  const includeCharacters = options.includeCharacters ?? true;

  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "Music Videos"',
      "created: 2026-05-12",
      ...(includeCharacters ? ["characters: ./characters/"] : []),
      "pipelines:",
      "  music-video: {}",
      "defaults:",
      "  pipeline: music-video",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeCharacter(
  root: string,
  showSlug: string,
  slug: string,
  options: { sheet?: string; references?: string[] } = {},
): Promise<void> {
  const characterDir = path.join(root, "shows", showSlug, "characters", slug);
  await mkdir(characterDir, { recursive: true });
  const referenceLines = options.references ? ["references:", ...options.references] : [];
  await writeFile(
    path.join(characterDir, "character.yaml"),
    [
      `slug: ${slug}`,
      `voice_id: voice-${slug}`,
      'visual_description: "A grounded host with a neon jacket."',
      'persona: "Focused but warm."',
      ...referenceLines,
      "",
    ].join("\n"),
    "utf8",
  );

  if (options.sheet) {
    await writeFile(path.join(characterDir, "character_sheet.md"), options.sheet, "utf8");
  }
}
