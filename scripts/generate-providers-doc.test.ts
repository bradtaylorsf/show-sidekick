import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Registry } from "../src/registry/index.js";
import { providerCatalogBanner, renderProvidersDoc } from "./generate-providers-doc.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureToolsDir = path.resolve(scriptsDir, "../src/registry/__fixtures__/tools-happy");

describe("generate providers doc", () => {
  it("renders deterministic fixture output sorted by capability, integration kind, and name", async () => {
    const first = await renderFixtureDoc();
    const second = await renderFixtureDoc();

    expect(second).toBe(first);
    expect(first.startsWith(providerCatalogBanner)).toBe(true);

    const betaIndex = first.indexOf("| `beta` | production | library | zod | none | still images | not declared |");
    const alphaIndex = first.indexOf("| `alpha` | beta | api | acme | `ALPHA_KEY` | short narration | not declared |");
    const gammaIndex = first.indexOf("| `gamma` | experimental | binary | say | none | local voice scratch tracks | not declared |");

    expect(betaIndex).toBeGreaterThan(-1);
    expect(alphaIndex).toBeGreaterThan(-1);
    expect(gammaIndex).toBeGreaterThan(-1);
    expect(betaIndex).toBeLessThan(alphaIndex);
    expect(alphaIndex).toBeLessThan(gammaIndex);
    expect(providerRows(first)).toHaveLength(3);
  });
});

async function renderFixtureDoc(): Promise<string> {
  const registry = new Registry({ toolsDir: fixtureToolsDir });
  await registry.discover();
  return renderProvidersDoc(registry.all());
}

function providerRows(markdown: string): string[] {
  return markdown.split("\n").filter((line) => line.startsWith("| `"));
}
