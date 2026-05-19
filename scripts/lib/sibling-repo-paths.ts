export const FORBIDDEN_TRACKED_PATHS = [".migration/"] as const;

export const SIBLING_REPO_PATH_NEEDLES = ["sibling-repo", "sibling repo", "reference codebase"] as const;

export const STALE_PUBLIC_NAME_NEEDLES = [
  "predit",
  ".predit/",
  "PREDIT_",
  ".migration",
  "sibling-repo",
  "sibling repo",
  "reference codebase",
] as const;

export const STALE_PUBLIC_NAME_GREP_TARGETS = [
  "README.md",
  "CHANGELOG.md",
  "docs",
  "specs",
  "bundled/templates",
  "bundled/skills",
] as const;

export const STALE_PUBLIC_NAME_LINE_ALLOWLIST = [
  {
    filePath: "CHANGELOG.md",
    needle: "predit",
    linePattern: "^- Public launch renames build-era `predit` to Show Sidekick, .*$",
  },
  {
    filePath: "CHANGELOG.md",
    needle: ".predit/",
    linePattern: "^- User-project cache/docs move from `.predit/` to `.show-sidekick/`\\..*$",
  },
  {
    filePath: "CHANGELOG.md",
    needle: "predit",
    linePattern: "^- User-project cache/docs move from `.predit/` to `.show-sidekick/`\\..*$",
  },
  {
    filePath: "CHANGELOG.md",
    needle: "PREDIT_",
    linePattern: "^- User-project cache/docs move from `.predit/` to `.show-sidekick/`\\. Current `PREDIT_\\*` env vars .*$",
  },
  {
    filePath: "docs/providers.md",
    needle: "PREDIT_",
    linePattern: "^.*PREDIT_.*$",
  },
  {
    filePath: "bundled/templates/user-project/.env.example",
    needle: "PREDIT_",
    linePattern: "^PREDIT_[A-Z0-9_]+=$",
  },
] as const;

export const SIBLING_REPO_GREP_EXCLUDES = [
  ".gitignore",
  "AGENTS.md",
  "IMPLEMENTATION.md",
  "scripts/lib/sibling-repo-paths.ts",
  "scripts/public-flip-checklist.ts",
  "tests/release/public-flip-checklist.test.ts",
] as const;
