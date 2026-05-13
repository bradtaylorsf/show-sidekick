import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RegistryError } from "./errors.js";
import { Registry } from "./registry.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): string {
  return resolve(fixtureRoot, name);
}

describe("Registry", () => {
  it("discovers tool default exports and supports lookup by name, capability, and provider", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-happy") });

    await registry.discover();

    expect(registry.get("alpha")?.provider).toBe("acme");
    expect(registry.byCapability("tts").map((tool) => tool.name)).toEqual(["alpha", "gamma"]);
    expect(registry.byProvider("bravo").map((tool) => tool.name)).toEqual(["beta", "gamma"]);
  });

  it("rejects duplicate tool names as a fatal registry error", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-duplicate") });

    try {
      await registry.discover();
      throw new Error("expected discover to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryError);
      expect(error).toMatchObject({ code: "duplicate-tool" });
      expect((error as RegistryError).message).toMatch(/one\.ts.*two\.ts|two\.ts.*one\.ts/);
    }
  });

  it("rejects tools missing required fields", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-missing-field") });

    try {
      await registry.discover();
      throw new Error("expected discover to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryError);
      expect(error).toMatchObject({ code: "invalid-tool" });
      expect((error as RegistryError).message).toContain("capability");
      expect((error as RegistryError).message).toContain("bad.ts");
    }
  });
});
