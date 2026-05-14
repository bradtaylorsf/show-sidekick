import { isAbsolute, relative, resolve } from "node:path";

export function resolveProjectPath(inputPath: string, projectRoot: string): string {
  return resolveProjectWritePath(inputPath, projectRoot);
}

export function resolveProjectReadPath(inputPath: string, projectRoot: string): string {
  if (isAbsolute(inputPath)) {
    return resolve(inputPath);
  }

  return resolve(projectRoot, inputPath);
}

export function resolveProjectWritePath(inputPath: string, projectRoot: string): string {
  const root = resolve(projectRoot);
  const resolved = isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath);
  const relativePath = relative(root, resolved);

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolved;
  }

  throw new Error(`path must stay inside project root: ${inputPath}`);
}
