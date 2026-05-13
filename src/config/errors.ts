export type ConfigIssue = {
  path: string;
  message: string;
};

export type ConfigErrorOptions = {
  filePath: string;
  line?: number;
  column?: number;
  issues: ConfigIssue[];
};

export class ConfigError extends Error {
  readonly filePath: string;
  readonly line?: number;
  readonly column?: number;
  readonly issues: ConfigIssue[];

  constructor(options: ConfigErrorOptions) {
    super(formatConfigError(options));
    this.name = "ConfigError";
    this.filePath = options.filePath;
    this.line = options.line;
    this.column = options.column;
    this.issues = options.issues;
  }

  format(): string {
    return this.message;
  }
}

function formatConfigError(options: ConfigErrorOptions): string {
  const location = options.line
    ? `${options.filePath}:${options.line}${options.column ? `:${options.column}` : ""}`
    : options.filePath;
  const issueLines = options.issues.map((issue) => {
    const path = issue.path ? issue.path : "<root>";
    return `- ${path}: ${issue.message}`;
  });

  return [`Config error in ${location}`, ...issueLines].join("\n");
}
