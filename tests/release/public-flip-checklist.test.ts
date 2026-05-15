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
