export class AbortedByUser extends Error {
  constructor(message = "Execution aborted by user") {
    super(message);
    this.name = "AbortedByUser";
  }
}

export class AwaitingHuman extends Error {
  readonly payload: unknown;

  constructor(message = "Awaiting human approval", payload?: unknown) {
    super(message);
    this.name = "AwaitingHuman";
    this.payload = payload;
  }
}

export class MajorChangeBlocked extends Error {
  readonly change: string;

  constructor(change: string, message = `Major change "${change}" requires explicit approval and a logged decision`) {
    super(message);
    this.name = "MajorChangeBlocked";
    this.change = change;
  }
}
