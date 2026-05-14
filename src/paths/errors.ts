export class ProjectRootNotFoundError extends Error {
  readonly cwd: string;

  constructor(cwd: string) {
    super(
      `Not inside a predit project (no CLAUDE.md + .predit/ found from ${cwd}). Run 'predit init' to scaffold one.`,
    );
    this.name = "ProjectRootNotFoundError";
    this.cwd = cwd;
  }
}

export class ProjectAlreadyInitializedError extends Error {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    super(`Refusing to initialize an existing predit project at ${projectRoot}. Run 'predit update' to refresh it.`);
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
