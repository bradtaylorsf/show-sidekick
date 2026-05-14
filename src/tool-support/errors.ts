export function errorWithInstallHint(error: unknown, install: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const hint = `Install: ${install}`;

  if (message.includes(hint)) {
    return new Error(message);
  }

  return new Error(`${message}\n${hint}`);
}
