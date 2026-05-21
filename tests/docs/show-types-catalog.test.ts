import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPROVED_BUNDLED_PIPELINE_SLUGS, SHOW_ONLY_DENYLIST } from "../../src/pipelines/demo-inventory.js";
import {
  resolveShowTypeCatalog,
  validateShowTypeCatalog,
  type ShowTypeCatalogRow,
} from "../../scripts/lib/show-types-catalog.ts";

const repoRoot = process.cwd();

describe("show type catalog", () => {
  it("resolves every documented lane against bundled inventory", async () => {
    const validation = await validateShowTypeCatalog({ repoRoot });

    expect(validation.errors).toEqual([]);
  });

  it("covers every approved public pipeline and bundled public starter", async () => {
    const validation = await validateShowTypeCatalog({ repoRoot });
    const pipelineRows = validation.catalog.rows.filter((row) => row.laneId.startsWith("pipeline:"));
    const starterRows = validation.catalog.rows.filter((row) => row.laneId.startsWith("starter:"));

    expect(pipelineRows.map((row) => row.pipelineSlug).sort((left, right) => left.localeCompare(right))).toEqual(
      [...APPROVED_BUNDLED_PIPELINE_SLUGS].sort((left, right) => left.localeCompare(right)),
    );
    expect(starterRows.map((row) => row.starterSlug).sort((left, right) => String(left).localeCompare(String(right)))).toEqual(
      [...validation.inventory.starters.keys()].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("rejects catalog lanes that cannot be resolved from bundled inventory", async () => {
    const validation = await validateShowTypeCatalog({ repoRoot });
    const baseRow = requiredRow(validation.catalog.rows, "pipeline:animation");
    const badRow: ShowTypeCatalogRow = {
      ...baseRow,
      laneId: "pipeline:not-real",
      pipelineSlug: "not-real",
    };

    const [resolution] = resolveShowTypeCatalog({ rows: [badRow] }, validation.inventory);

    expect(resolution?.errors.join("\n")).toContain("unknown public pipeline 'not-real'");
  });

  it("keeps show-only concepts out of pipeline lanes when denylisted", async () => {
    const validation = await validateShowTypeCatalog({ repoRoot });
    const pipelineSlugs = new Set(
      validation.catalog.rows.filter((row) => row.laneId.startsWith("pipeline:")).map((row) => row.pipelineSlug),
    );
    for (const slug of SHOW_ONLY_DENYLIST) {
      expect(pipelineSlugs.has(slug), `${slug} must not be a pipeline catalog row`).toBe(false);
    }
  });

  it("keeps the README linked to the public show type catalog", async () => {
    const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

    expect(readme).toMatch(/\[.*show types.*\]\(docs\/show-types\.md\)/i);
  });
});

function requiredRow(rows: readonly ShowTypeCatalogRow[], laneId: string): ShowTypeCatalogRow {
  const row = rows.find((candidate) => candidate.laneId === laneId);
  if (row === undefined) {
    throw new Error(`missing test fixture lane ${laneId}`);
  }
  return row;
}
