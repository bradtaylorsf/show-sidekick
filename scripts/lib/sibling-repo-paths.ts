export const FORBIDDEN_TRACKED_PATHS = [".migration/"] as const;

export const SIBLING_REPO_PATH_NEEDLES = ["sibling-repo", "sibling repo", "reference codebase"] as const;

export const SIBLING_REPO_GREP_EXCLUDES = [
  ".gitignore",
  "AGENTS.md",
  "IMPLEMENTATION.md",
  "scripts/lib/sibling-repo-paths.ts",
  "scripts/public-flip-checklist.ts",
  "specs/01-repo-and-licensing.md",
  "tests/release/public-flip-checklist.test.ts",
] as const;
