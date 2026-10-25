import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import { extname } from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);

export function mediaKind(path: string): "image" | "video" | undefined {
  const ext = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }
  return undefined;
}

export type Size = { width: number; height: number };

/** Reads width/height from a PNG, JPEG, or WebP header without decoding the image. */
export async function readImageSize(path: string): Promise<Size | undefined> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return imageSizeFromBytes(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export function imageSizeFromBytes(bytes: Buffer): Size | undefined {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      const length = bytes.readUInt16BE(offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return undefined;
  }

  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    }
    if (chunk === "VP8 ") {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return undefined;
}

/** Video width/height via ffprobe; undefined when ffprobe is missing or cannot read the file. */
export function probeVideoSize(path: string): Promise<Size | undefined> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path],
      { timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
          const stream = parsed.streams?.[0];
          resolve(
            typeof stream?.width === "number" && typeof stream.height === "number"
              ? { width: stream.width, height: stream.height }
              : undefined,
          );
        } catch {
          resolve(undefined);
        }
      },
    );
  });
}
