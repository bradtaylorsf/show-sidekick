export type LoggerMode = {
  json: boolean;
  verbose: boolean;
  color: boolean;
};

const defaults: LoggerMode = {
  json: false,
  verbose: false,
  color: true,
};

let mode: LoggerMode = { ...defaults };

export function configure(options: Partial<LoggerMode>): void {
  mode = { ...mode, ...options };

  if (mode.color === false) {
    process.env.NO_COLOR = "1";
  }
}

export function current(): LoggerMode {
  return { ...mode };
}

export function resetLoggerMode(): void {
  mode = { ...defaults };
}
