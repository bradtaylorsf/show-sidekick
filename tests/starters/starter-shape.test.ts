import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { loadYaml } from "../../src/config/loader.js";
import {
  classifyForDefaultStarter,
  isApprovedBundledPipeline,
  isShowOnlyConcept,
} from "../../src/pipelines/demo-inventory.js";
import { EpisodeSchema, validateEpisodeAgainstShow } from "../../src/shows/episode.js";
import { CharacterSchema } from "../../src/shows/character.js";
import { ShowSchema, type Show } from "../../src/shows/show.js";

const repoRoot = process.cwd();
const startersRoot = path.join(repoRoot, "bundled", "starters");
const requiredAudioLedStarters = ["cinematic-trailer", "music-video", "news-song", "thechaosfm"];
const requiredVisualExplainerStarters = ["animated-explainer", "documentary", "product-demo"];
const requiredSpecialtyStarters = ["ai-workflow-demo", "last-rev", "rave-queen", "ww2-diary"];

const StarterMetadataSchema = z.object({
  fixture_size_bytes: z.number().int().nonnegative(),
  expected_sample_duration_s: z.number().positive(),
}).strict();

describe("bundled starters", () => {
  it("ships the D-4 audio-led starter set", async () => {
    const starterNames = await starterDirectoryNames();

    expect(starterNames).toEqual(expect.arrayContaining(requiredAudioLedStarters));
  });

  it("ships the D-5 visual/explainer starter set", async () => {
    const starterNames = await starterDirectoryNames();

    expect(starterNames).toEqual(expect.arrayContaining(requiredVisualExplainerStarters));
  });

  it("ships the D-6 specialty starter set", async () => {
    const starterNames = await starterDirectoryNames();

    expect(starterNames).toEqual(expect.arrayContaining(requiredSpecialtyStarters));
  });

  it("keeps every starter schema-valid and fixture-backed", async () => {
    const starterNames = await starterDirectoryNames();

    for (const starterName of starterNames) {
      const starterDir = path.join(startersRoot, starterName);
      const showPath = path.join(starterDir, "show.yaml");
      const readmePath = path.join(starterDir, "README.md");
      const inputsDir = path.join(starterDir, "inputs", "sample-episode");

      await expect(access(path.join(starterDir, "brand"))).resolves.toBeUndefined();
      await expect(access(path.join(starterDir, "characters", "_template", "character.yaml"))).resolves.toBeUndefined();
      await expect(access(path.join(starterDir, "episode.template.yaml"))).resolves.toBeUndefined();
      await expect(access(path.join(starterDir, "episodes", "sample-episode.yaml"))).resolves.toBeUndefined();
      await expect(access(inputsDir)).resolves.toBeUndefined();
      await expect(access(readmePath)).resolves.toBeUndefined();

      const show = (await loadYaml(showPath, ShowSchema)) as Show;
      const templateEpisode = await loadYaml(path.join(starterDir, "episode.template.yaml"), EpisodeSchema);
      const sampleEpisode = await loadYaml(path.join(starterDir, "episodes", "sample-episode.yaml"), EpisodeSchema);
      const character = await loadYaml(path.join(starterDir, "characters", "_template", "character.yaml"), CharacterSchema);
      const metadata = await starterMetadata(showPath);
      const readme = await readFile(readmePath, "utf8");

      expect(templateEpisode.pipeline).toBeDefined();
      expect(validateEpisodeAgainstShow(sampleEpisode, show)).toEqual({ ok: true, errors: [] });
      expect(character.slug).toBe("_template");
      expect(metadata.fixture_size_bytes).toBe(await directorySize(inputsDir));
      expect(metadata.expected_sample_duration_s).toBe(15);
      expect(sampleEpisode.inputs).not.toEqual({});
      await expectSampleInputsExist(starterDir, show, sampleEpisode.inputs);
      expect(readme, `${starterName} README must distinguish starter name`).toContain(`Starter: \`${starterName}\``);
      expect(readme, `${starterName} README must not mention stale pending pipelines`).not.toContain(
        "Pending pipeline dependency",
      );
      if (starterName === "ai-workflow-demo") {
        expect(show.pipelines["screen-demo"]?.capture_mode).toBe("synthetic_terminal");
      }

      for (const [pipelineName, config] of Object.entries(show.pipelines)) {
        await expectPipelineExists(starterName, pipelineName);
        expect(isApprovedBundledPipeline(pipelineName), `${starterName} pipeline '${pipelineName}'`).toBe(true);
        expect(classifyForDefaultStarter(pipelineName), `${starterName} pipeline '${pipelineName}'`).toBeDefined();
        expect(isShowOnlyConcept(pipelineName), `${starterName} must not bind to a show-only concept`).toBe(false);
        expect(pipelineName, `${starterName} must not use the framework smoke test pipeline`).not.toBe(
          "framework-smoke",
        );
        expect(readme, `${starterName} README must name the real pipeline slug '${pipelineName}'`).toContain(
          `Pipeline slug: \`${pipelineName}\``,
        );
        if (config.playbook !== undefined) {
          await expect(access(path.join(repoRoot, "bundled", "playbooks", `${config.playbook}.yaml`))).resolves.toBeUndefined();
        }
      }
    }
  });
});

async function starterDirectoryNames(): Promise<string[]> {
  const entries = await readdir(startersRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function starterMetadata(showPath: string): Promise<z.infer<typeof StarterMetadataSchema>> {
  const raw = YAML.parse(await readFile(showPath, "utf8")) as unknown;
  if (!isRecord(raw)) {
    throw new Error(`starter show.yaml must be an object at ${showPath}`);
  }

  return StarterMetadataSchema.parse(raw.starter);
}

async function expectSampleInputsExist(
  starterDir: string,
  show: Show,
  inputs: Record<string, unknown>,
): Promise<void> {
  const projectRelativePrefix = `shows/${show.slug}/`;
  let fixturePathCount = 0;

  for (const value of Object.values(inputs)) {
    if (typeof value !== "string" || !value.startsWith(projectRelativePrefix)) {
      continue;
    }

    const starterRelative = value.slice(projectRelativePrefix.length);
    await expect(access(path.join(starterDir, starterRelative))).resolves.toBeUndefined();
    fixturePathCount += 1;
  }

  expect(fixturePathCount).toBeGreaterThan(0);
}

async function expectPipelineExists(
  starterName: string,
  pipelineName: string,
): Promise<void> {
  await expect(
    access(path.join(repoRoot, "bundled", "pipelines", `${pipelineName}.yaml`)),
    `${starterName} should bind to an existing bundled pipeline '${pipelineName}'`,
  ).resolves.toBeUndefined();
}

async function directorySize(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return directorySize(entryPath);
      }
      if (entry.isFile()) {
        return (await stat(entryPath)).size;
      }
      return 0;
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
