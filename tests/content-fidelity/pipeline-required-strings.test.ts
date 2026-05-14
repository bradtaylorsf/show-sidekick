import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

const pipelineSkillsDir = fileURLToPath(new URL("../../bundled/skills/pipelines/", import.meta.url));

type FixtureEntry =
  | string
  | {
      file?: string;
      section?: string;
      phrase?: string;
      numeric?: string;
      module?: string;
      text?: string;
    };

type RequiredStringsFixture = {
  pipeline: string;
  required_sections?: FixtureEntry[];
  required_phrases?: FixtureEntry[];
  required_numerics?: FixtureEntry[];
  required_modules?: FixtureEntry[];
};

describe("pipeline content-fidelity fixtures", () => {
  it("finds every required string declared by pipeline fixtures", async () => {
    const fixtures = await findFixtureFiles(pipelineSkillsDir);
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixturePath of fixtures) {
      const fixture = parseYaml(await readFile(fixturePath, "utf8")) as RequiredStringsFixture;
      const pipelineDir = path.dirname(path.dirname(fixturePath));

      await expectEntries(fixturePath, pipelineDir, "required_sections", fixture.required_sections ?? []);
      await expectEntries(fixturePath, pipelineDir, "required_phrases", fixture.required_phrases ?? []);
      await expectEntries(fixturePath, pipelineDir, "required_numerics", fixture.required_numerics ?? []);
      await expectEntries(fixturePath, pipelineDir, "required_modules", fixture.required_modules ?? []);
    }
  });
});

async function expectEntries(
  fixturePath: string,
  pipelineDir: string,
  field: keyof Omit<RequiredStringsFixture, "pipeline">,
  entries: FixtureEntry[],
): Promise<void> {
  for (const entry of entries) {
    const { file, text } = normalizeEntry(entry, field);

    if (file) {
      const content = await readFile(path.join(pipelineDir, file), "utf8");
      expect(content, `${fixturePath} ${field} ${text} in ${file}`).toContain(text);
      continue;
    }

    const files = await markdownFiles(pipelineDir);
    const matches = await Promise.all(files.map(async (candidate) => (await readFile(candidate, "utf8")).includes(text)));
    expect(matches.some(Boolean), `${fixturePath} ${field} ${text}`).toBe(true);
  }
}

function normalizeEntry(
  entry: FixtureEntry,
  field: keyof Omit<RequiredStringsFixture, "pipeline">,
): { file?: string; text: string } {
  if (typeof entry === "string") {
    return { text: entry };
  }

  const text = entry.section ?? entry.phrase ?? entry.numeric ?? entry.module ?? entry.text;
  if (!text) {
    throw new Error(`${field} fixture entry must include a string value`);
  }

  return { file: entry.file, text };
}

async function findFixtureFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return findFixtureFiles(entryPath);
      }

      return entry.isFile() && entry.name === "required-strings.yaml" ? [entryPath] : [];
    }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return entry.name === "__fixtures__" ? [] : markdownFiles(entryPath);
      }

      if (!entry.isFile() || !entry.name.endsWith(".md") || !(await isTextFile(entryPath))) {
        return [];
      }

      return [entryPath];
    }),
  );

  return files.flat();
}

async function isTextFile(filePath: string): Promise<boolean> {
  const fileStat = await stat(filePath);
  return fileStat.size < 1_000_000;
}
