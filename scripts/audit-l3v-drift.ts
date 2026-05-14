import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { upsertGitHubPrComment } from "./github-pr-comment.ts";

const repoRoot = process.cwd();
const migrationDir = path.join(repoRoot, ".migration");
const bundledAgentsDir = path.join(repoRoot, "bundled", "skills", "agents");
const ignoredSkillNames = new Set(["agents", "license", "provenance", "readme", "template"]);

async function main(): Promise<void> {
  if (!existsSync(migrationDir)) {
    console.log("L3V drift audit skipped: .migration is absent");
    return;
  }

  const sourceSkills = await discoverSourceLayer3Skills(migrationDir);
  if (sourceSkills.size === 0) {
    console.log("L3V drift audit skipped: no Layer 3 source inventory found");
    return;
  }

  const bundledSkills = await discoverBundledAgentSkills();
  const missing = [...sourceSkills]
    .filter((skill) => !bundledSkills.has(normalizeSkillName(skill)))
    .sort((left, right) => left.localeCompare(right));

  if (missing.length === 0) {
    console.log("L3V drift audit passed");
    return;
  }

  const body = renderComment(missing);
  console.error(body);
  await tryComment("<!-- predit:l3v-drift -->", body);
  process.exit(1);
}

async function discoverSourceLayer3Skills(root: string): Promise<Set<string>> {
  const files = await walkMarkdownFiles(root);
  const skills = new Set<string>();

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(path.relative(root, filePath));
    const segments = relativePath.split("/");
    const agentsIndex = segments.lastIndexOf("agents");

    if (agentsIndex >= 0) {
      const firstAfterAgents = segments[agentsIndex + 1];
      const secondAfterAgents = segments[agentsIndex + 2];

      if (firstAfterAgents?.endsWith(".md") && segments.length === agentsIndex + 2) {
        addSkill(skills, firstAfterAgents.replace(/\.md$/u, ""));
      }

      if (firstAfterAgents !== undefined && secondAfterAgents === "SKILL.md") {
        addSkill(skills, firstAfterAgents);
      }

      continue;
    }

    if (segments.some((segment) => /^l3v|layer-?3$/iu.test(segment)) && segments.at(-1)?.endsWith(".md")) {
      addSkill(skills, segments.at(-1)?.replace(/\.md$/u, "") ?? "");
    }
  }

  return skills;
}

async function discoverBundledAgentSkills(): Promise<Set<string>> {
  const entries = await readdir(bundledAgentsDir, { withFileTypes: true });
  const skills = new Set<string>();

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      addSkill(skills, entry.name.replace(/\.md$/u, ""));
    }

    if (entry.isDirectory() && existsSync(path.join(bundledAgentsDir, entry.name, "SKILL.md"))) {
      addSkill(skills, entry.name);
    }
  }

  return new Set([...skills].map((skill) => normalizeSkillName(skill)));
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = normalizeRelativePath(path.relative(migrationDir, absolutePath));

    if (relativePath.split("/").some((segment) => segment === ".git" || segment === "node_modules")) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function addSkill(skills: Set<string>, rawName: string): void {
  const normalized = normalizeSkillName(rawName);
  if (normalized.length > 0 && !ignoredSkillNames.has(normalized)) {
    skills.add(rawName);
  }
}

function normalizeSkillName(value: string): string {
  return value.toLowerCase().replace(/[_\s]+/gu, "-");
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/u, "");
}

function renderComment(missing: readonly string[]): string {
  const lines = [
    "## L3V Drift",
    "",
    "New Layer 3 skills were found in the private source inventory but are not present in `bundled/skills/agents/`.",
    "",
  ];

  for (const skill of missing.slice(0, 100)) {
    lines.push(`- \`${skill}\``);
  }

  if (missing.length > 100) {
    lines.push(`- ...and ${missing.length - 100} more`);
  }

  return lines.join("\n");
}

async function tryComment(marker: string, body: string): Promise<void> {
  try {
    const commented = await upsertGitHubPrComment({ marker, body });
    if (commented) {
      console.error("updated GitHub PR L3V drift comment");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`failed to update GitHub PR L3V drift comment: ${message}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
