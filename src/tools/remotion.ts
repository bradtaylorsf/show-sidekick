import { execFile } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  AssetManifestSchema,
  CuesheetSchema,
  EditDecisionsSchema,
  PlaybookSchema,
  RenderReportSchema,
  type RenderReport,
} from "../artifacts/index.js";
import { playbookToCssVariables } from "../compose/hyperframes-style-bridge.js";
import { cuesheetToWords, validateCaptionFrameSync } from "../remotion/index.js";
import { defineTool, type ToolAvailabilityContext } from "../registry/index.js";

const require = createRequire(import.meta.url);

export const RemotionComposeInputSchema = z.object({
  edit_decisions: EditDecisionsSchema,
  asset_manifest: AssetManifestSchema.optional(),
  output_path: z.string().optional(),
  cuesheet: CuesheetSchema.optional(),
  playbook: PlaybookSchema.optional(),
  fps: z.number().positive().default(30),
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});

export type RemotionComposeInput = z.infer<typeof RemotionComposeInputSchema>;

export default defineTool({
  name: "remotion",
  capability: "video_compose",
  provider: "remotion",
  status: "beta",
  integration: {
    kind: "library",
    package: "remotion",
    install: "npm install --save-dev remotion react react-dom @remotion/renderer @remotion/cli zod@4.3.6",
  },
  best_for: "typed Remotion-compatible scene catalog validation with word-level caption checks; renderer invocation lands with the compose runner",
  supports: ["scene-catalog", "caption-burn", "playbook-css-variables"],
  input: RemotionComposeInputSchema,
  output: RenderReportSchema,
  isAvailable: async (ctx) => remotionAvailable(ctx),

  async execute(params, ctx) {
    const parsed = RemotionComposeInputSchema.parse(params);
    const validationSteps: RenderReport["validation_steps"] = [];

    if (parsed.cuesheet) {
      const words = cuesheetToWords(parsed.cuesheet);
      const sync = validateCaptionFrameSync(words, parsed.fps);
      validationSteps.push({
        name: "caption_sync",
        status: sync.status,
        notes: `${sync.checked_words} words checked; max drift ${sync.max_drift_s}s at ${parsed.fps}fps.`,
      });
    }

    if (parsed.playbook) {
      playbookToCssVariables(parsed.playbook);
      validationSteps.push({
        name: "style_bridge",
        status: "pass",
        notes: "Playbook palette, typography, motion, and caption style resolved through the shared CSS bridge.",
      });
    }

    const duration = parsed.edit_decisions.cuts.reduce((max, cut) => Math.max(max, cut.end_s), 0);

    if (parsed.asset_manifest !== undefined) {
      const rendered = await renderWithRemotionCli(parsed, ctx.projectRoot, duration);
      validationSteps.push({
        name: "remotion_render",
        status: "pass",
        notes: "Rendered a project-local Remotion composition from edit_decisions and asset_manifest.",
      });

      return RenderReportSchema.parse({
        ...rendered,
        validation_steps: validationSteps,
      });
    }

    return RenderReportSchema.parse({
      output_path: parsed.output_path ?? "renders/remotion.mp4",
      encoding_profile: "remotion/default",
      duration_s: duration,
      resolution: { width: 1920, height: 1080 },
      framerate: parsed.fps,
      runtime_used: "remotion",
      asset_count: parsed.edit_decisions.cuts.length,
      warnings: [],
      validation_steps: validationSteps,
    });
  },
});

async function renderWithRemotionCli(
  input: RemotionComposeInput,
  projectRoot: string,
  durationS: number,
): Promise<Omit<RenderReport, "validation_steps">> {
  const outputPath = resolveAssetPath(input.output_path ?? "renders/remotion.mp4", projectRoot);
  const workspace = join(projectRoot, ".predit-work", `remotion-${Date.now()}`);
  const entryPoint = join(workspace, "index.jsx");
  const publicDir = join(workspace, "public");
  const durationInFrames = Math.max(1, Math.ceil(durationS * input.fps));
  const resolution = input.resolution ?? { width: 1920, height: 1080 };

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(workspace, { recursive: true });
  const media = await prepareRemotionMedia(input, projectRoot, publicDir);
  await writeFile(entryPoint, remotionEntrySource(input, projectRoot, durationInFrames, resolution, media), "utf8");

  try {
    await runRemotion(projectRoot, [
      "remotion",
      "render",
      entryPoint,
      "PreditSample",
      outputPath,
      "--codec",
      "h264",
      "--audio-codec",
      "aac",
      "--overwrite",
      "--public-dir",
      publicDir,
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  return {
    output_path: projectRelativePath(projectRoot, outputPath),
    encoding_profile: "remotion/h264-aac",
    duration_s: durationS,
    resolution,
    framerate: input.fps,
    runtime_used: "remotion",
    asset_count: input.asset_manifest?.assets.length ?? input.edit_decisions.cuts.length,
    warnings: [],
  };
}

function remotionEntrySource(
  input: RemotionComposeInput,
  projectRoot: string,
  durationInFrames: number,
  resolution: { width: number; height: number },
  media: RemotionMediaMap,
): string {
  const assets = new Map(input.asset_manifest?.assets.map((asset) => [asset.id, asset]) ?? []);
  const audioPath = input.edit_decisions.audio?.music?.track_path;
  const audioSource = audioPath ? mediaSrc(audioPath, projectRoot, media) : undefined;
  const props = {
    fps: input.fps,
    cuts: input.edit_decisions.cuts.map((cut, index) => {
      const asset = assets.get(cut.asset_id);
      const source = asset?.path ? mediaSrc(asset.path, projectRoot, media) : undefined;
      return {
        index,
        startFrame: Math.round(cut.start_s * input.fps),
        durationFrames: Math.max(1, Math.round((cut.end_s - cut.start_s) * input.fps)),
        src: source?.src,
        useStaticFile: source?.useStaticFile ?? false,
        kind: asset?.kind ?? "video",
        label: asset?.prompt ?? cut.asset_id,
      };
    }),
    audioSrc: audioSource?.src,
    audioUsesStaticFile: audioSource?.useStaticFile ?? false,
    width: resolution.width,
    height: resolution.height,
  };

  return `
import React from "react";
import { AbsoluteFill, Audio, Composition, Img, OffthreadVideo, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame } from "remotion";

const props = ${JSON.stringify(props)};

function mediaUrl(src, useStaticFile) {
  return useStaticFile ? staticFile(src) : src;
}

function Scene({ cut, total }) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, cut.durationFrames - 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = 1.02 + progress * (cut.index % 2 === 0 ? 0.08 : 0.04);
  const x = (cut.index % 2 === 0 ? -1 : 1) * progress * 36;
  const y = Math.sin(progress * Math.PI) * -18;
  const title = String(cut.label || "").replace(/^Generated deterministic /, "").slice(0, 96);
  const mediaStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scale(" + scale + ") translate(" + x + "px, " + y + "px)",
  };
  const src = cut.src ? mediaUrl(cut.src, cut.useStaticFile) : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020", overflow: "hidden" }}>
      {src && cut.kind === "image" ? <Img src={src} style={mediaStyle} /> : null}
      {src && cut.kind !== "image" ? <OffthreadVideo src={src} muted={Boolean(props.audioSrc)} style={mediaStyle} /> : null}
      <AbsoluteFill style={{
        background: "linear-gradient(90deg, rgba(6,10,24,0.78), rgba(6,10,24,0.18) 48%, rgba(6,10,24,0.72))",
      }} />
      <div style={{
        position: "absolute",
        left: 76,
        bottom: 70,
        maxWidth: 1120,
        color: "white",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 48,
        fontWeight: 700,
        lineHeight: 1.08,
        textShadow: "0 4px 18px rgba(0,0,0,0.5)",
        opacity: interpolate(frame, [0, 12, Math.max(18, cut.durationFrames - 10), cut.durationFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>{title}</div>
      <div style={{
        position: "absolute",
        right: 76,
        top: 64,
        color: "#8ee8ff",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 24,
        letterSpacing: 0,
        fontWeight: 700,
      }}>BEAT {cut.index + 1} / {total}</div>
    </AbsoluteFill>
  );
}

function PreditSample({ cuts, audioSrc }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020" }}>
      {cuts.map((cut) => (
        <Sequence key={cut.index} from={cut.startFrame} durationInFrames={cut.durationFrames}>
          <Scene cut={cut} total={cuts.length} />
        </Sequence>
      ))}
      {audioSrc ? <Audio src={mediaUrl(audioSrc, props.audioUsesStaticFile)} /> : null}
    </AbsoluteFill>
  );
}

export const RemotionRoot = () => (
  <Composition
    id="PreditSample"
    component={PreditSample}
    durationInFrames={${durationInFrames}}
    fps={props.fps}
    width={props.width}
    height={props.height}
    defaultProps={props}
  />
);
registerRoot(RemotionRoot);
export default RemotionRoot;
`;
}

type RemotionMediaSource = {
  readonly src: string;
  readonly useStaticFile: boolean;
};

type RemotionMediaMap = Map<string, RemotionMediaSource>;

async function prepareRemotionMedia(
  input: RemotionComposeInput,
  projectRoot: string,
  publicDir: string,
): Promise<RemotionMediaMap> {
  const media = new Map<string, RemotionMediaSource>();
  const values = [
    ...(input.asset_manifest?.assets.map((asset) => asset.path).filter(Boolean) ?? []),
    input.edit_decisions.audio?.music?.track_path,
  ].filter((value): value is string => Boolean(value));
  const seen = new Set<string>();

  await mkdir(publicDir, { recursive: true });

  for (const value of values) {
    if (/^https?:\/\//iu.test(value) || value.startsWith("data:")) {
      media.set(value, { src: value, useStaticFile: false });
      continue;
    }

    const absolutePath = resolveAssetPath(value, projectRoot);
    if (seen.has(absolutePath)) {
      const existing = media.get(absolutePath);
      if (existing) {
        media.set(value, existing);
      }
      continue;
    }
    seen.add(absolutePath);

    const safeName = safeMediaName(seen.size, absolutePath);
    const relativePublicPath = `media/${safeName}`;
    const targetPath = join(publicDir, relativePublicPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(absolutePath, targetPath);

    const source = { src: relativePublicPath, useStaticFile: true };
    media.set(value, source);
    media.set(absolutePath, source);
  }

  return media;
}

function runRemotion(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("npx", args, { cwd, maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60_000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolvePromise();
    });
  });
}

function mediaSrc(value: string, projectRoot: string, media: RemotionMediaMap): RemotionMediaSource {
  if (/^https?:\/\//iu.test(value) || value.startsWith("data:")) {
    return { src: value, useStaticFile: false };
  }

  const absolutePath = resolveAssetPath(value, projectRoot);
  return media.get(value) ?? media.get(absolutePath) ?? { src: pathToFileURL(absolutePath).href, useStaticFile: false };
}

function safeMediaName(index: number, value: string): string {
  const extension = extname(value) || ".bin";
  const base = basename(value, extension).replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "") || "asset";
  return `${String(index).padStart(2, "0")}-${base}${extension}`;
}

function resolveAssetPath(value: string, projectRoot: string): string {
  return isAbsolute(value) ? value : resolve(projectRoot, value);
}

function projectRelativePath(projectRoot: string, value: string): string {
  return isAbsolute(value) ? value.replace(resolve(projectRoot) + "/", "") : value;
}

function remotionAvailable(
  ctx?: ToolAvailabilityContext,
): { available: true } | { available: false; reason: string; fix: "install" } {
  const packageName = "remotion";
  const resolvers = [
    ...(ctx?.projectRoot ? [createRequire(`${ctx.projectRoot}/package.json`)] : []),
    require,
  ];

  for (const resolver of resolvers) {
    try {
      resolver.resolve(packageName);
      return { available: true };
    } catch {
      // Try the next resolver.
    }
  }

  return { available: false, reason: "package not installed: remotion", fix: "install" };
}
