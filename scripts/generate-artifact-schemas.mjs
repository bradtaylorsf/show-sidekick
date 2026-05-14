#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArtifactJsonSchemas } from "../dist/artifacts/json-schema.js";

const repoRoot = process.cwd();
const targetDir = path.join(repoRoot, "bundled/schemas/artifacts");

await mkdir(targetDir, { recursive: true });

for (const [name, schema] of Object.entries(ArtifactJsonSchemas).sort(([left], [right]) => left.localeCompare(right))) {
  const targetPath = path.join(targetDir, `${name}.schema.json`);
  await writeFile(targetPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}

console.log(`Generated ${Object.keys(ArtifactJsonSchemas).length} artifact schemas in ${path.relative(repoRoot, targetDir)}.`);
