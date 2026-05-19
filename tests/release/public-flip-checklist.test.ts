import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CI_READY_STALE_PUBLIC_NAME_GREP_TARGETS } from "../../scripts/lib/sibling-repo-paths.js";
import {
  runPublicFlipChecklist,
  type PublicFlipCheck,
  type PublicFlipChecklistResult,
  type RunShell,
} from "../../scripts/public-flip-checklist.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const execFileAsync = promisify(execFile);
const checkIds: readonly PublicFlipCheck["id"][] = [
  "migration-removed",
  "no-sibling-paths",
  "no-stale-public-names",
  "package-bin-rename",
  "cache-dir-rename",
  "env-prefix-rename",
  "docs-links",
  "provider-catalog",
  "pack-manifest",
  "packed-tarball-smoke",
  "license-apache-2",
  "readme-complete",
  "changelog-v0.1.0",
  "bundled-runnable-example",
  "watch-import-fixture",
  "pnpm-green",
  "pre-release-issues-clear",
];
const currentlyPassingCheckIds: readonly PublicFlipCheck["id"][] = checkIds;

const resultPromise = runPublicFlipChecklist({
  allowLocalMigrationBridge: true,
  repoRoot,
  runShell: passingRunShell(),
  skipBuild: true,
});

describe("public-flip checklist", () => {
  it("emits every public launch gate check", async () => {
    const checks = (await resultPromise).checks.map((check) => check.id);

    expect(checks).toEqual(checkIds);
  });

  for (const checkId of currentlyPassingCheckIds) {
    it(`does not fail ${checkId}`, async () => {
      const check = await findCheck(resultPromise, checkId);

      expect(check.status, check.detail).not.toBe("fail");
    });
  }

  it("fails the bundled runnable example check when starter E2E is skipped", async () => {
    const result = await runPublicFlipChecklist({
      allowLocalMigrationBridge: true,
      repoRoot,
      runShell: passingRunShell(),
      skipBuild: true,
      skipE2E: true,
    });

    const check = result.checks.find((candidate) => candidate.id === "bundled-runnable-example");
    expect(check).toMatchObject({
      status: "fail",
      detail: "Starter E2E execution was skipped; the public-flip gate must run pnpm run test:smoke",
    });
  });

  it("fails the packed tarball smoke check when E2E is skipped", async () => {
    const result = await runPublicFlipChecklist({
      allowLocalMigrationBridge: true,
      repoRoot,
      runShell: passingRunShell(),
      skipBuild: true,
      skipE2E: true,
    });

    const check = result.checks.find((candidate) => candidate.id === "packed-tarball-smoke");
    expect(check).toMatchObject({
      status: "fail",
      detail: "Packed tarball smoke was skipped; the public launch gate must install and exercise the packed package",
    });
  });

  it("passes package/bin rename after the public package is renamed", async () => {
    const check = await findCheck(resultPromise, "package-bin-rename");

    expect(check).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("show-sidekick"),
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

  it("allows internal migration-note stale names", async () => {
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
              stdout: [
                "CHANGELOG.md:11:- Public launch renames build-era `predit` to Show Sidekick, with npm package `show-sidekick` and CLI `showkick`.",
                "specs/18-public-naming-contract.md:21:`predit` is a pre-public implementation name. It does not remain as a public npm package, package binary, CLI command, cache name, docs vocabulary, or environment prefix.",
                "",
              ].join("\n"),
              stderr: "",
            };
          }
          if (needle === ".predit/") {
            return {
              status: 0,
              stdout:
                "CHANGELOG.md:12:- User-project cache/docs move from `.predit/` to `.show-sidekick/`. Legacy `PREDIT_*` env vars fail with guidance to rename them to matching `SHOW_SIDEKICK_*` names.\n",
              stderr: "",
            };
          }
          if (needle === "PREDIT_") {
            return {
              status: 0,
              stdout: [
                "CHANGELOG.md:12:- User-project cache/docs move from `.predit/` to `.show-sidekick/`. Legacy `PREDIT_*` env vars fail with guidance to rename them to matching `SHOW_SIDEKICK_*` names.",
                "docs/providers.md:14:Show Sidekick-owned tool configuration uses the `SHOW_SIDEKICK_*` environment prefix. Legacy `PREDIT_*` names from pre-public projects are rejected with migration guidance.",
                'src/branding.ts:22:  envPrefix: "PREDIT_",',
                "",
              ].join("\n"),
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

  it("fails stale public-name checks for accidental package or source references", async () => {
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
              stdout: ['package.json:2:  "name": "predit",', "src/cli/program.ts:1:program.name('predit')", ""].join(
                "\n",
              ),
              stderr: "",
            };
          }

          return { status: 1, stdout: "", stderr: "" };
        }

        return passingRunShell()(command, args, { cwd: repoRoot });
      },
      skipBuild: true,
    });

    const check = result.checks.find((candidate) => candidate.id === "no-stale-public-names");
    expect(check).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("package.json:2"),
    });
    expect(check?.detail).toContain("src/cli/program.ts:1");
  });

  // Enforces SR-6 / #232: the stale-name and sibling-path guards must run in CI
  // (via `pnpm test`) against the real repo, not just against mocked grep output,
  // so future agent edits cannot reintroduce stale public naming and stay green.
  describe("real repository scan (CI enforcement)", () => {
    const realScanPromise = runPublicFlipChecklist({
      allowLocalMigrationBridge: true,
      repoRoot,
      runShell: realGrepRunShell,
      skipBuild: true,
      skipE2E: true,
      stalePublicNameGrepTargets: CI_READY_STALE_PUBLIC_NAME_GREP_TARGETS,
    });

    for (const checkId of ["no-stale-public-names", "no-sibling-paths", "migration-removed"] as const) {
      it(`passes ${checkId} against the actual repository`, { timeout: 60_000 }, async () => {
        const check = await findCheck(realScanPromise, checkId);
        expect(check.status, check.detail).toBe("pass");
      });
    }
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

function passingRunShell(): RunShell {
  return async (command, args) => {
    if (command === "git" && args[0] === "grep") {
      const needleIndex = args.indexOf("-e");
      const needle = needleIndex >= 0 ? args[needleIndex + 1] : undefined;
      if (needle === "SHOW_SIDEKICK_") {
        return { status: 0, stdout: "src/tools/example.ts\n", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "" };
    }

    if (command === "npm" && args[0] === "pack") {
      return { status: 0, stdout: packManifestStdout(), stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  };
}

async function realGrepRunShell(command: string, args: readonly string[], options: { readonly cwd: string }) {
  if (command === "git") {
    const result = await execFileAsync(command, [...args], {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    }).catch((error: unknown) => {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "number"
      ) {
        return {
          stdout: String((error as { stdout?: unknown }).stdout ?? ""),
          stderr: String((error as { stderr?: unknown }).stderr ?? ""),
          code: (error as { code: number }).code,
        };
      }
      throw error;
    });

    return {
      status: "code" in result ? result.code : 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  return passingRunShell()(command, args, options);
}

function packManifestStdout(): string {
  return JSON.stringify([
    {
      files: [
        { path: "dist/cli/index.js" },
        { path: "bundled/templates/user-project/AGENTS.md" },
        { path: "bundled/schemas/artifacts/render_report.schema.json" },
        { path: "bundled/pipelines/animated-explainer.yaml" },
        { path: "bundled/starters/animated-explainer/show.yaml" },
        { path: "docs/quickstart.md" },
        { path: "README.md" },
        { path: "CHANGELOG.md" },
        { path: "LICENSE" },
        { path: "package.json" },
      ],
    },
  ]);
}
