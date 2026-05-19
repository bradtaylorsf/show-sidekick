import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  runPublicFlipChecklist,
  type PublicFlipCheck,
  type PublicFlipChecklistResult,
} from "../../scripts/public-flip-checklist.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const checkIds: readonly PublicFlipCheck["id"][] = [
  "migration-removed",
  "no-sibling-paths",
  "no-stale-public-names",
  "license-apache-2",
  "readme-complete",
  "changelog-v0.1.0",
  "bundled-runnable-example",
  "watch-import-fixture",
  "pnpm-green",
  "pre-release-issues-clear",
];

const resultPromise = runPublicFlipChecklist({
  allowLocalMigrationBridge: true,
  repoRoot,
  runShell: async (command, args) => {
    if (command === "git" && args[0] === "grep") {
      return { status: 1, stdout: "", stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  },
  skipBuild: true,
});

describe("public-flip checklist", () => {
  for (const checkId of checkIds) {
    it(`does not fail ${checkId}`, async () => {
      const check = await findCheck(resultPromise, checkId);

      expect(check.status, check.detail).not.toBe("fail");
    });
  }

  it("fails the bundled runnable example check when starter E2E is skipped", async () => {
    const result = await runPublicFlipChecklist({
      allowLocalMigrationBridge: true,
      repoRoot,
      runShell: async (command, args) => {
        if (command === "git" && args[0] === "grep") {
          return { status: 1, stdout: "", stderr: "" };
        }

        return { status: 0, stdout: "", stderr: "" };
      },
      skipBuild: true,
      skipE2E: true,
    });

    const check = result.checks.find((candidate) => candidate.id === "bundled-runnable-example");
    expect(check).toMatchObject({
      status: "fail",
      detail: "Starter E2E execution was skipped; the public-flip gate must run pnpm run test:smoke",
    });
  });

  it("fails the stale public-name check when agent-facing files mention the old name", async () => {
    const result = await runPublicFlipChecklist({
      allowLocalMigrationBridge: true,
      repoRoot,
      runShell: async (command, args) => {
        if (command === "git" && args[0] === "grep") {
          const needleIndex = args.indexOf("-e");
          const needle = needleIndex >= 0 ? args[needleIndex + 1] : undefined;
          if (needle === "predit") {
            return {
              status: 0,
              stdout: "bundled/templates/user-project/AGENTS.md:1:predit user project\n",
              stderr: "",
            };
          }

          return { status: 1, stdout: "", stderr: "" };
        }

        return { status: 0, stdout: "", stderr: "" };
      },
      skipBuild: true,
    });

    const check = result.checks.find((candidate) => candidate.id === "no-stale-public-names");
    expect(check).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("bundled/templates/user-project/AGENTS.md:1"),
    });
  });

  it("allows legacy env identifiers in the user-project env template", async () => {
    const result = await runPublicFlipChecklist({
      allowLocalMigrationBridge: true,
      repoRoot,
      runShell: async (command, args) => {
        if (command === "git" && args[0] === "grep") {
          const needleIndex = args.indexOf("-e");
          const needle = needleIndex >= 0 ? args[needleIndex + 1] : undefined;
          if (needle === "PREDIT_") {
            return {
              status: 0,
              stdout: "bundled/templates/user-project/.env.example:160:PREDIT_R2_BUCKET=\n",
              stderr: "",
            };
          }

          return { status: 1, stdout: "", stderr: "" };
        }

        return { status: 0, stdout: "", stderr: "" };
      },
      skipBuild: true,
    });

    const check = result.checks.find((candidate) => candidate.id === "no-stale-public-names");
    expect(check).toMatchObject({ status: "pass" });
  });
});

async function findCheck(
  result: Promise<PublicFlipChecklistResult>,
  checkId: PublicFlipCheck["id"],
): Promise<PublicFlipCheck> {
  const checks = (await result).checks;
  const check = checks.find((candidate) => candidate.id === checkId);
  if (check === undefined) {
    throw new Error(`Missing public-flip checklist check: ${checkId}`);
  }

  return check;
}
