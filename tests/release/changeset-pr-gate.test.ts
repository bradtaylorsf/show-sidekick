import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runChangesetPrGate, type ChangesetPrGateOptions } from "../../scripts/changeset-pr-gate.js";

const basePackageJson = { name: "show-sidekick", version: "0.1.2" };
const releasePackageJson = { name: "show-sidekick", version: "0.2.0" };

describe("changeset PR gate", () => {
  it("passes when changesets status passes", async () => {
    const repoRoot = await fixtureRepo({
      packageJson: basePackageJson,
      changelog: "# Changelog\n",
      changesetFiles: ["bright-decks-flow.md"],
    });

    const result = await runGate({
      repoRoot,
      changesetStatusExitCode: 0,
    });

    expect(result).toMatchObject({
      status: "pass",
      reason: "changeset status passed",
      exitCode: 0,
    });
  });

  it("passes when a no-release label is present", async () => {
    const repoRoot = await fixtureRepo({
      packageJson: basePackageJson,
      changelog: "# Changelog\n",
      changesetFiles: [],
    });
    const eventPath = path.join(repoRoot, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify({ pull_request: { base: { ref: "main" }, labels: [{ name: "no-release" }] } }),
      "utf8",
    );

    const result = await runGate({
      repoRoot,
      eventPath,
      changesetStatusExitCode: 1,
    });

    expect(result).toMatchObject({
      status: "pass",
      reason: "no-release label present; skipping changeset requirement",
      exitCode: 0,
    });
  });

  it("passes when the branch already contains a version bump and changelog entry", async () => {
    const repoRoot = await fixtureRepo({
      packageJson: releasePackageJson,
      changelog: "# Changelog\n\n## 0.2.0\n\n### Minor Changes\n",
      changesetFiles: [],
    });

    const result = await runGate({
      repoRoot,
      changesetStatusExitCode: 1,
    });

    expect(result).toMatchObject({
      status: "pass",
      reason: "versioned release branch detected: show-sidekick 0.1.2 -> 0.2.0",
      exitCode: 0,
    });
  });

  it("fails when changesets status fails and the branch is not versioned", async () => {
    const repoRoot = await fixtureRepo({
      packageJson: basePackageJson,
      changelog: "# Changelog\n",
      changesetFiles: [],
    });

    const result = await runGate({
      repoRoot,
      changesetStatusExitCode: 1,
    });

    expect(result).toMatchObject({
      status: "fail",
      reason: "changeset status failed and package.json version was not bumped",
      exitCode: 1,
    });
  });
});

async function fixtureRepo(options: {
  readonly packageJson: { readonly name: string; readonly version: string };
  readonly changelog: string;
  readonly changesetFiles: readonly string[];
}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "show-sidekick-changeset-gate-"));
  await mkdir(path.join(repoRoot, ".changeset"));
  await writeFile(path.join(repoRoot, "package.json"), `${JSON.stringify(options.packageJson, null, 2)}\n`, "utf8");
  await writeFile(path.join(repoRoot, "CHANGELOG.md"), options.changelog, "utf8");
  await writeFile(path.join(repoRoot, ".changeset", "README.md"), "# Changesets\n", "utf8");

  for (const file of options.changesetFiles) {
    await writeFile(path.join(repoRoot, ".changeset", file), "---\n", "utf8");
  }

  return repoRoot;
}

async function runGate(options: {
  readonly repoRoot: string;
  readonly changesetStatusExitCode: number;
  readonly eventPath?: string;
}): Promise<Awaited<ReturnType<typeof runChangesetPrGate>>> {
  const gateOptions: ChangesetPrGateOptions = {
    argv: ["--since=origin/main"],
    eventPath: options.eventPath,
    repoRoot: options.repoRoot,
    write: () => undefined,
    writeError: () => undefined,
    runCommand: async (command, args) => {
      if (command === "pnpm") {
        return {
          exitCode: options.changesetStatusExitCode,
          stdout: "",
          stderr: options.changesetStatusExitCode === 0 ? "" : "changeset status failed",
        };
      }

      if (command === "git" && args[0] === "show" && args[1] === "origin/main:package.json") {
        return { exitCode: 0, stdout: `${JSON.stringify(basePackageJson)}\n`, stderr: "" };
      }

      return { exitCode: 1, stdout: "", stderr: `unexpected command: ${command} ${args.join(" ")}` };
    },
  };

  return runChangesetPrGate(gateOptions);
}
