#!/usr/bin/env node

import { CommanderError } from "commander";
import { BRANDING } from "../branding.js";
import { VERSION } from "../version.js";
import { createProgram } from "./program.js";

try {
  if (process.argv.length <= 2) {
    process.stdout.write(`${BRANDING.primaryCli} v${VERSION}\n`);
  } else {
    await createProgram().parseAsync(process.argv);
  }
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
    process.exitCode = 1;
  }
}
