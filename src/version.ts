import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(here, "..", "package.json");
const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };

export const VERSION: string = pkg.version;
