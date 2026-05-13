import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

describe("bundled cuesheet director skill", () => {
  it("has validated frontmatter and review guidance", () => {
    const markdown = readFileSync(skillPath(), "utf8");
    const frontmatter = parseFrontmatter(markdown);

    expect(frontmatter).toMatchObject({
      name: "cuesheet-director",
      applies_to: ["cuesheet"],
      produces: "cuesheet",
    });
    expect(markdown).toContain("source: \"manual\"");
    expect(markdown).toContain("within 200 ms");
  });
});

function skillPath(): string {
  return fileURLToPath(new URL("../../bundled/skills/pipelines/_shared/cuesheet-director.md", import.meta.url));
}

function parseFrontmatter(markdown: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---/u.exec(markdown);

  if (!match) {
    throw new Error("missing frontmatter");
  }

  return parseYaml(match[1]) as Record<string, unknown>;
}
