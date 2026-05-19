import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRAND_COMPATIBILITY, BRANDING, LEGACY_BRANDING } from "./branding.js";
import { createProgram } from "./cli/program.js";

type PackageJson = {
  name: string;
  bin?: Record<string, string>;
};

function repoFile(relativePath: string): string {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

describe("public branding contract", () => {
  it("locks the public naming constants", () => {
    expect(BRANDING).toMatchObject({
      productDisplayName: "Show Sidekick",
      packageName: "show-sidekick",
      primaryCli: "showkick",
      domain: "showsidekick.com",
      websiteUrl: "https://showsidekick.com",
      docsUrl: "https://showsidekick.com/docs",
      quickstartUrl: "https://showsidekick.com/docs/quickstart",
      cacheDir: ".show-sidekick",
      cacheVersionFileName: "version.json",
      lockfileName: "show-sidekick.lock",
      envPrefix: "SHOW_SIDEKICK_",
    });
    expect(BRANDING.cliBinaries).toEqual(["showkick", "show-sidekick", "showsidekick"]);
  });

  it("keeps the constants internally consistent", () => {
    expect(BRANDING.cliBinaries).toContain(BRANDING.primaryCli);
    expect(BRANDING.cacheDir.startsWith(".")).toBe(true);
    expect(BRANDING.envPrefix.endsWith("_")).toBe(true);
    expect(BRANDING.lockfileName).toContain(BRANDING.packageName);
  });

  it("documents the legacy compatibility boundary", () => {
    expect(LEGACY_BRANDING).toMatchObject({
      primaryCli: "predit",
      cacheDir: ".predit",
      envPrefix: "PREDIT_",
    });
    expect(BRAND_COMPATIBILITY).toMatchObject({
      retainLegacyCliBinary: false,
      legacyProjectCacheBehavior: "migrate-to-public-cache",
      legacyEnvVarBehavior: "reject-with-migration-guidance",
      removalTargetVersion: "0.2.0",
    });
  });
});

describe("public branding drift", () => {
  it("keeps package.json and Commander aligned to the public names", () => {
    const pkg = JSON.parse(readFileSync(repoFile("package.json"), "utf8")) as PackageJson;

    expect(pkg.name).toBe(BRANDING.packageName);
    expect(pkg.bin).toEqual(Object.fromEntries(BRANDING.cliBinaries.map((name) => [name, "./dist/cli/index.js"])));
    expect(createProgram().name()).toBe(BRANDING.primaryCli);
  });

  it("keeps quickstart install docs aligned to the public package name", () => {
    for (const file of ["README.md", "docs/quickstart.md"]) {
      const markdown = readFileSync(repoFile(file), "utf8");

      expect(markdown).toContain(BRANDING.packageName);
      expect(markdown).not.toMatch(/\b(?:npm install -g|pnpm add -g|npx|pnpx) predit\b/u);
    }
  });
});
