import { execFile } from "node:child_process";
import type { ToolCommandRunner } from "../registry/tool.js";

export const defaultRunCli: ToolCommandRunner = (command, args, options = {}) => {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command} failed: ${stderr || error.message}`));
          return;
        }

        resolvePromise({ stdout, stderr });
      },
    );

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
};
