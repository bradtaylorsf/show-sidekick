import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("release workflow", () => {
  it("uses trusted publishing permissions and release gates before npm publish", async () => {
    const workflowText = await readFile(path.join(repoRoot, ".github", "workflows", "release.yml"), "utf8");
    const workflow = YAML.parse(workflowText) as {
      permissions: Record<string, string>;
      jobs: { release: { steps: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }> } };
    };
    const steps = workflow.jobs.release.steps;
    const runText = steps.flatMap((step) => (step.run === undefined ? [] : [step.run])).join("\n");
    const usesText = steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses])).join("\n");

    expect(workflow.permissions["id-token"]).toBe("write");
    expect(workflow.permissions.contents).toBe("write");
    expect(workflowText).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
    expect(workflowText).toContain("show-sidekick");
    expect(usesText).toContain("changesets/action@v1");
    expect(usesText).toContain("actions/upload-artifact@v4");
    expect(runText).toContain("pnpm install --frozen-lockfile");
    expect(runText).toContain("pnpm typecheck");
    expect(runText).toContain("pnpm test");
    expect(runText).toContain("pnpm build");
    expect(runText).toContain("pnpm run docs:providers:check");
    expect(runText).toContain("pnpm show-types:check");
    expect(runText).toContain("pnpm show-types:matrix -- --zero-key --json");
    expect(runText).toContain("pnpm run test:smoke");
    expect(runText).toContain("pnpm release:check");
    expect(runText).toContain("pnpm pack --pack-destination /tmp/show-sidekick-pack");
    expect(runText).toContain("npm publish --dry-run --provenance --access public");
    expect(workflowText).toContain("publish: pnpm changeset:publish");
    expect(runText).toContain("show-type-validation-report");
  });

  it("requires changesets or an explicit no-release label in PR CI", async () => {
    const workflowText = await readFile(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    YAML.parse(workflowText);

    expect(workflowText).toContain("no-release");
    expect(workflowText).toContain("pnpm changeset:status");
    expect(workflowText).toContain("pnpm release:check");
    expect(workflowText).toContain("fetch-depth: 0");
  });

  it("configures package dry-run metadata and changeset scripts", async () => {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      files?: string[];
      publishConfig?: { access?: string };
      scripts?: Record<string, string>;
    };

    expect(pkg.publishConfig).toEqual(expect.objectContaining({ access: "public" }));
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "bundled", "docs", "README.md", "CHANGELOG.md", "LICENSE"]));
    expect(pkg.scripts).toEqual(
      expect.objectContaining({
        changeset: "pnpm dlx @changesets/cli",
        "changeset:status": "pnpm dlx @changesets/cli status --since=origin/main",
        "changeset:version": "pnpm dlx @changesets/cli version",
        "changeset:publish": "pnpm build && npm publish --provenance --access public",
        "release:smoke:pack": "pnpm build && SHOW_SIDEKICK_PACKED_TARBALL_SMOKE=1 vitest run tests/release/packed-tarball-smoke.test.ts",
        prepublishOnly: "pnpm build",
      }),
    );
  });

  it("documents the selected changesets release mechanism", async () => {
    const config = YAML.parse(await readFile(path.join(repoRoot, ".changeset", "config.json"), "utf8")) as {
      baseBranch?: string;
      access?: string;
    };
    const readme = await readFile(path.join(repoRoot, ".changeset", "README.md"), "utf8");

    expect(config).toEqual(expect.objectContaining({ baseBranch: "main", access: "public" }));
    expect(readme).toContain("Changesets");
    expect(readme).toContain("trusted publishing/OIDC");
    expect(readme).toContain("no-release");
  });
});
