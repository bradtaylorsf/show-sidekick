export const BRANDING = Object.freeze({
  productDisplayName: "Show Sidekick",
  packageName: "show-sidekick",
  primaryCli: "showkick",
  cliBinaries: Object.freeze(["showkick", "show-sidekick", "showsidekick"] as const),
  domain: "showsidekick.com",
  websiteUrl: "https://showsidekick.com",
  docsUrl: "https://showsidekick.com/docs",
  quickstartUrl: "https://showsidekick.com/docs/quickstart",
  cacheDir: ".show-sidekick",
  cacheVersionFileName: "version.json",
  lockfileName: "show-sidekick.lock",
  envPrefix: "SHOW_SIDEKICK_",
});

export const LEGACY_BRANDING = Object.freeze({
  productName: "predit",
  packageName: "predit",
  primaryCli: "predit",
  cacheDir: ".predit",
  lockfileName: "predit.lock",
  envPrefix: "PREDIT_",
});

export const BRAND_COMPATIBILITY = Object.freeze({
  retainLegacyCliBinary: false,
  legacyProjectCacheBehavior: "migrate-to-public-cache",
  legacyEnvVarBehavior: "reject-with-migration-guidance",
  removalTargetVersion: "0.2.0",
});
