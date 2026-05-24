import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadShowComposeRecipe, renderResolvedOverlayFrame } from "./overlay-recipe.js";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describe("compose overlay recipe", () => {
  it("loads a show-owned recipe, resolves templates, and renders the declared overlay components", async () => {
    const root = await scratchProject();
    const showRoot = path.join(root, "shows", "show");

    await writeFile(
      path.join(showRoot, "compose", "recipe.yaml"),
      [
        "overlays:",
        "  - component: hero_title",
        "    props:",
        '      title: "{{ show.display_name | upper }}"',
        '      subtitle: "{{ episode.title }}"',
        "    timeline:",
        "      from_s: 0",
        "      to_s: end",
        "  - component: caption_burn",
        "    props:",
        "      source: script",
        "    timeline:",
        "      sync: script",
        "",
      ].join("\n"),
      "utf8",
    );

    const overlays = await loadShowComposeRecipe({
      projectRoot: root,
      show: {
        slug: "show",
        display_name: "First 48 Hours",
        rootDir: showRoot,
        brandPath: path.join(showRoot, "brand"),
      },
      episode: {
        slug: "episode",
        title: "Hospital Discharge",
        filePath: path.join(showRoot, "episodes", "episode.yaml"),
      },
      script: {
        sections: [
          {
            slug: "hook",
            start_s: 0,
            end_s: 2,
            narration: "Stay ready now.",
            dialogue: [],
            enhancement_cues: [],
            slide_ids: [],
          },
        ],
      },
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      durationS: 2,
    });

    expect(overlays).toMatchObject([
      {
        component: "hero_title",
        registry: "overlay",
        props: {
          title: "FIRST 48 HOURS",
          subtitle: "Hospital Discharge",
        },
        timeline: {
          from_s: 0,
          to_s: "end",
        },
      },
      {
        component: "caption_burn",
        registry: "overlay",
        props: {
          words: [
            expect.objectContaining({ text: "Stay" }),
            expect.objectContaining({ text: "ready" }),
            expect.objectContaining({ text: "now." }),
          ],
        },
        timeline: {
          sync: "script",
        },
      },
    ]);
    expect(renderResolvedOverlayFrame(overlays, 18)).toMatchSnapshot();
  });

  it("surfaces unknown component names against the recipe path", async () => {
    const root = await scratchProject();
    const showRoot = path.join(root, "shows", "show");

    await writeFile(
      path.join(showRoot, "compose", "recipe.yaml"),
      ["overlays:", "  - component: lower_third", "    props:", "      title: Nope", ""].join("\n"),
      "utf8",
    );

    await expect(
      loadShowComposeRecipe({
        projectRoot: root,
        show: {
          slug: "show",
          display_name: "Show",
          rootDir: showRoot,
        },
        episode: {
          slug: "episode",
          title: "Episode",
        },
      }),
    ).rejects.toThrow(/recipe\.yaml[\s\S]*unknown component 'lower_third'/u);
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `show-sidekick-overlay-recipe-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, "shows", "show", "compose"), { recursive: true });
  await mkdir(path.join(root, "shows", "show", "episodes"), { recursive: true });
  return root;
}
