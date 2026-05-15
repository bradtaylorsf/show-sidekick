import { access, copyFile, mkdir, symlink } from "node:fs/promises";
import path from "node:path";

export const ASSET_LINK_MODES = ["copy", "symlink", "reference"] as const;

export type AssetLinkMode = (typeof ASSET_LINK_MODES)[number];

export function parseAssetLinkMode(value: string | undefined, source = "--asset-link-mode"): AssetLinkMode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isAssetLinkMode(value)) {
    return value;
  }

  throw new Error(`${source} must be one of: ${ASSET_LINK_MODES.join(", ")}`);
}

export function isAssetLinkMode(value: string): value is AssetLinkMode {
  return ASSET_LINK_MODES.includes(value as AssetLinkMode);
}

export function resolveAssetSourcePath(projectRoot: string, assetPath: string): string {
  return path.isAbsolute(assetPath) ? path.normalize(assetPath) : path.resolve(projectRoot, assetPath);
}

export async function linkAsset(sourceAbsolutePath: string, destinationAbsolutePath: string, mode: AssetLinkMode): Promise<string> {
  await access(sourceAbsolutePath);

  if (mode === "reference") {
    return sourceAbsolutePath;
  }

  await mkdir(path.dirname(destinationAbsolutePath), { recursive: true });

  if (mode === "copy") {
    await copyFile(sourceAbsolutePath, destinationAbsolutePath);
    return destinationAbsolutePath;
  }

  await symlink(sourceAbsolutePath, destinationAbsolutePath);
  return destinationAbsolutePath;
}
