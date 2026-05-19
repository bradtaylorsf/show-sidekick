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
  "package.json",
  "src",
  "docs",
  "specs",
  "bundled/templates",
  "bundled/skills",
] as const;

export const INTERNAL_MIGRATION_STALE_PUBLIC_NAME_LINE_ALLOWLIST = [
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
  {
    filePath: "docs/public-readiness-audit.md",
    needle: "predit",
    linePattern:
      "^- Open \\(#227/#228/#229\\): package name/bin still use `predit`, cache references still use `\\.predit/`, and env vars still use `PREDIT_`; .*$",
  },
  {
    filePath: "docs/public-readiness-audit.md",
    needle: ".predit/",
    linePattern:
      "^- Open \\(#227/#228/#229\\): package name/bin still use `predit`, cache references still use `\\.predit/`, and env vars still use `PREDIT_`; .*$",
  },
  {
    filePath: "docs/public-readiness-audit.md",
    needle: "PREDIT_",
    linePattern:
      "^- Open \\(#227/#228/#229\\): package name/bin still use `predit`, cache references still use `\\.predit/`, and env vars still use `PREDIT_`; .*$",
  },
] as const;

export const ACCIDENTAL_STALE_PUBLIC_NAME_LINE_ALLOWLIST = [] as const;

export const STALE_PUBLIC_NAME_LINE_ALLOWLIST = [
  ...INTERNAL_MIGRATION_STALE_PUBLIC_NAME_LINE_ALLOWLIST,
  ...ACCIDENTAL_STALE_PUBLIC_NAME_LINE_ALLOWLIST,
] as const;

export const CI_READY_STALE_PUBLIC_NAME_GREP_TARGETS = [
  "README.md",
  "CHANGELOG.md",
  "docs",
  "specs",
  "bundled/templates",
  "bundled/skills",
] as const;

export const SIBLING_REPO_GREP_EXCLUDES = [
  ".gitignore",
  "AGENTS.md",
  "scripts/lib/sibling-repo-paths.ts",
  "scripts/public-flip-checklist.ts",
  "tests/release/public-flip-checklist.test.ts",
] as const;
