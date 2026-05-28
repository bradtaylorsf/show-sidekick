import { describe, expect, it } from "vitest";
import {
  runReleaseNpmVersionCheck,
  type ReleaseNpmVersionCheckOptions,
} from "../../scripts/release-npm-version-check.js";

const packageJson = { name: "show-sidekick", version: "0.2.0" };

describe("release npm version check", () => {
  it("passes when the local version is published and tagged latest", async () => {
    const result = await runCheck({
      argv: ["--expect-published"],
      versions: {
        "show-sidekick": "0.2.0",
        "show-sidekick@0.2.0": "0.2.0",
      },
    });

    expect(result).toMatchObject({
      exactVersionPublished: true,
      npmLatestVersion: "0.2.0",
      exitCode: 0,
    });
  });

  it("fails published verification when latest still points at an older version", async () => {
    const result = await runCheck({
      argv: ["--expect-published"],
      versions: {
        "show-sidekick": "0.1.2",
        "show-sidekick@0.2.0": "0.2.0",
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain("npm latest for show-sidekick is 0.1.2; expected 0.2.0");
  });

  it("passes unpublished verification when the local version is not on npm yet", async () => {
    const result = await runCheck({
      argv: ["--expect-unpublished"],
      versions: {
        "show-sidekick": "0.1.2",
      },
    });

    expect(result).toMatchObject({
      exactVersionPublished: false,
      npmLatestVersion: "0.1.2",
      exitCode: 0,
    });
  });
});

async function runCheck(options: {
  readonly argv: readonly string[];
  readonly versions: Record<string, string>;
}): Promise<Awaited<ReturnType<typeof runReleaseNpmVersionCheck>>> {
  const checkOptions: ReleaseNpmVersionCheckOptions = {
    argv: options.argv,
    packageJson,
    write: () => undefined,
    runCommand: async (_command, args) => {
      const spec = args[1];
      if (spec === undefined || !Object.prototype.hasOwnProperty.call(options.versions, spec)) {
        return { exitCode: 1, stdout: "", stderr: "npm ERR! code E404\nnpm ERR! 404 Not Found\n" };
      }

      return { exitCode: 0, stdout: `${JSON.stringify(options.versions[spec])}\n`, stderr: "" };
    },
  };

  return runReleaseNpmVersionCheck(checkOptions);
}
