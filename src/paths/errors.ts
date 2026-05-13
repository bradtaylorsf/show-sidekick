export class ProjectRootNotFoundError extends Error {
  readonly cwd: string;

  constructor(cwd: string) {
    super(`Could not find a predit project root from ${cwd}`);
    this.name = "ProjectRootNotFoundError";
    this.cwd = cwd;
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
