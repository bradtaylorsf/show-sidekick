import type { ConfigIssue } from "../config/errors.js";

export class InvalidCheckpoint extends Error {
  readonly filePath: string;
  readonly issues: ConfigIssue[];

  constructor(filePath: string, issues: ConfigIssue[]) {
    super(formatInvalidCheckpoint(filePath, issues));
    this.name = "InvalidCheckpoint";
    this.filePath = filePath;
    this.issues = issues;
  }
}

export class CheckpointMissingError extends Error {
  readonly filePath: string;

  constructor(filePath: string) {
    super(`Checkpoint not found at ${filePath}`);
    this.name = "CheckpointMissingError";
    this.filePath = filePath;
  }
}

function formatInvalidCheckpoint(filePath: string, issues: ConfigIssue[]): string {
  const issueLines = issues.map((issue) => {
    const path = issue.path ? issue.path : "<root>";
    return `- ${path}: ${issue.message}`;
  });

  return [`Invalid checkpoint in ${filePath}`, ...issueLines].join("\n");
}
