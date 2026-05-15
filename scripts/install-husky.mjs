import { existsSync } from "node:fs";
import { chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".git")) {
  process.exit(0);
}

if (existsSync(".husky/pre-commit")) {
  chmodSync(".husky/pre-commit", 0o755);
}

spawnSync("git", ["config", "core.hooksPath", ".husky"], { stdio: "ignore" });
