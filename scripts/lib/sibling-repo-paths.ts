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
  ":(exclude)src/**/*.test.ts",
  ":(exclude)src/*.test.ts",
  ":(exclude)src/**/__snapshots__/**",
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
    linePattern:
      "^- User-project cache/docs move from `.predit/` to `.show-sidekick/`\\. Legacy `PREDIT_\\*` env vars fail with guidance to rename them to matching `SHOW_SIDEKICK_\\*` names\\.$",
  },
  {
    filePath: "docs/providers.md",
    needle: "PREDIT_",
    linePattern:
      "^Show Sidekick-owned tool configuration uses the `SHOW_SIDEKICK_\\*` environment prefix\\. Legacy `PREDIT_\\*` names from pre-public projects are rejected with migration guidance\\.$",
  },
  {
    filePath: "specs/14-decision-log.md",
    needle: "predit",
    linePattern:
      "^The pre-public `predit` implementation name receives a hard public rename with no retained CLI binary alias\\. A temporary project-cache migration from `\\.predit/` to `\\.show-sidekick/` remains only through `v0\\.2\\.0`; legacy `PREDIT_\\*` environment variables fail with explicit `SHOW_SIDEKICK_\\*` remediation\\.$",
  },
  {
    filePath: "specs/14-decision-log.md",
    needle: ".predit/",
    linePattern:
      "^The pre-public `predit` implementation name receives a hard public rename with no retained CLI binary alias\\. A temporary project-cache migration from `\\.predit/` to `\\.show-sidekick/` remains only through `v0\\.2\\.0`; legacy `PREDIT_\\*` environment variables fail with explicit `SHOW_SIDEKICK_\\*` remediation\\.$",
  },
  {
    filePath: "specs/14-decision-log.md",
    needle: "PREDIT_",
    linePattern:
      "^The pre-public `predit` implementation name receives a hard public rename with no retained CLI binary alias\\. A temporary project-cache migration from `\\.predit/` to `\\.show-sidekick/` remains only through `v0\\.2\\.0`; legacy `PREDIT_\\*` environment variables fail with explicit `SHOW_SIDEKICK_\\*` remediation\\.$",
  },
  {
    filePath: "specs/18-public-naming-contract.md",
    needle: "predit",
    linePattern:
      "^`predit` is a pre-public implementation name\\. It does not remain as a public npm package, package binary, CLI command, cache name, docs vocabulary, or environment prefix\\.$",
  },
  {
    filePath: "specs/18-public-naming-contract.md",
    needle: "predit",
    linePattern: "^The public release is a hard rename for the npm package and CLI: no `predit` binary alias is retained\\.$",
  },
  {
    filePath: "specs/18-public-naming-contract.md",
    needle: "predit",
    linePattern:
      "^Pre-public user projects may still contain `\\.predit/` caches\\. The harness migrates that cache to `\\.show-sidekick/` when possible and keeps the migration path only through `v0\\.2\\.0`\\. Legacy `PREDIT_\\*` environment variables are not accepted as public configuration; commands must fail with migration guidance that names the matching `SHOW_SIDEKICK_\\*` variable\\.$",
  },
  {
    filePath: "specs/18-public-naming-contract.md",
    needle: ".predit/",
    linePattern:
      "^Pre-public user projects may still contain `\\.predit/` caches\\. The harness migrates that cache to `\\.show-sidekick/` when possible and keeps the migration path only through `v0\\.2\\.0`\\. Legacy `PREDIT_\\*` environment variables are not accepted as public configuration; commands must fail with migration guidance that names the matching `SHOW_SIDEKICK_\\*` variable\\.$",
  },
  {
    filePath: "specs/18-public-naming-contract.md",
    needle: "PREDIT_",
    linePattern:
      "^Pre-public user projects may still contain `\\.predit/` caches\\. The harness migrates that cache to `\\.show-sidekick/` when possible and keeps the migration path only through `v0\\.2\\.0`\\. Legacy `PREDIT_\\*` environment variables are not accepted as public configuration; commands must fail with migration guidance that names the matching `SHOW_SIDEKICK_\\*` variable\\.$",
  },
  {
    filePath: "src/branding.ts",
    needle: "predit",
    linePattern: '^(productName|packageName|primaryCli): "predit",$',
  },
  {
    filePath: "src/branding.ts",
    needle: "predit",
    linePattern: 'cacheDir: "\\.predit",',
  },
  {
    filePath: "src/branding.ts",
    needle: "predit",
    linePattern: 'lockfileName: "predit\\.lock",',
  },
  {
    filePath: "src/branding.ts",
    needle: ".predit",
    linePattern: 'cacheDir: "\\.predit",',
  },
  {
    filePath: "src/branding.ts",
    needle: ".predit/",
    linePattern: 'cacheDir: "\\.predit",',
  },
  {
    filePath: "src/branding.ts",
    needle: "PREDIT_",
    linePattern: 'envPrefix: "PREDIT_",',
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
