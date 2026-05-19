import { BRANDING } from "../branding.js";

export class ProjectRootNotFoundError extends Error {
  readonly cwd: string;

  constructor(cwd: string) {
    super(
      `Not inside a ${BRANDING.productDisplayName} project (no AGENTS.md plus ${BRANDING.cacheDir}/ or .env.example found from ${cwd}). Run '${BRANDING.primaryCli} init' to scaffold one.`,
    );
    this.name = "ProjectRootNotFoundError";
    this.cwd = cwd;
  }
}

export class ProjectAlreadyInitializedError extends Error {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    super(
      `Refusing to initialize an existing ${BRANDING.productDisplayName} project at ${projectRoot}. Run '${BRANDING.primaryCli} update' to refresh it.`,
    );
    this.name = "ProjectAlreadyInitializedError";
    this.projectRoot = projectRoot;
  }
}

export class MissingEnvError extends Error {
  readonly envName: string;

  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvError";
    this.envName = name;
  }
}

export class LegacyEnvVarError extends Error {
  readonly legacyName: string;
  readonly replacementName: string;

  constructor(legacyName: string, replacementName: string) {
    super(`Legacy environment variable ${legacyName} is no longer supported. Rename it to ${replacementName}.`);
    this.name = "LegacyEnvVarError";
    this.legacyName = legacyName;
    this.replacementName = replacementName;
  }
}

export class InvalidShowEpisodeError extends Error {
  readonly spec: string;

  constructor(spec: string) {
    super(`Expected <show>/<episode>, received: ${spec}`);
    this.name = "InvalidShowEpisodeError";
    this.spec = spec;
  }
}

export class InvalidResourceNameError extends Error {
  readonly resourceName: string;

  constructor(name: string) {
    super(`Invalid resource name (must stay inside the project): ${name}`);
    this.name = "InvalidResourceNameError";
    this.resourceName = name;
  }
}
