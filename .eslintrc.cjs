module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: false,
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  ignorePatterns: [
    "dist/",
    "node_modules/",
    "bundled/schemas/",
    "pnpm-lock.yaml",
    ".alpha-loop/",
    ".agents/",
    ".claude/",
    "projects/",
    ".worktrees/",
    "bundled/skills/agents/",
  ],
};
