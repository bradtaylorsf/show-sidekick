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
    animationFirst: input.edit_decisions.renderer_family === "animation-first",
    cuts: input.edit_decisions.cuts.map((cut, index) => {
      const asset = assets.get(cut.asset_id);
      const source = asset?.path ? mediaSrc(asset.path, projectRoot, media) : undefined;
      const card = starterCardCopy(asset?.prompt ?? cut.asset_id);
      return {
        index,
        startFrame: Math.round(cut.start_s * input.fps),
        durationFrames: Math.max(1, Math.round((cut.end_s - cut.start_s) * input.fps)),
        src: source?.src,
        useStaticFile: source?.useStaticFile ?? false,
        kind: asset?.kind ?? "video",
        label: asset?.prompt ?? cut.asset_id,
        eyebrow: card.eyebrow,
        title: card.title,
        body: card.body,
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
  if (props.animationFirst) {
    return <AnimatedExplainerScene cut={cut} total={total} progress={progress} frame={frame} />;
  }

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

const accents = ["#ffd666", "#3fdcff", "#ff67a6", "#7affa9"];
const darks = ["#111827", "#071625", "#200b1a", "#072018"];

function AnimatedExplainerScene({ cut, total, progress, frame }) {
  const accent = accents[cut.index % accents.length];
  const dark = darks[cut.index % darks.length];
  const entrance = interpolate(frame, [0, 18], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = interpolate(frame, [0, 12, Math.max(18, cut.durationFrames - 14), cut.durationFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleSize = cut.title.length > 34 ? 56 : cut.title.length > 24 ? 64 : 72;
  const bodySize = cut.body.length > 145 ? 31 : cut.body.length > 105 ? 35 : cut.body.length > 70 ? 40 : 45;
  const sweep = Math.round(progress * 520);
  const orbit = Math.sin(progress * Math.PI * 2 + cut.index) * 28;

  return (
    <AbsoluteFill style={{ backgroundColor: dark, overflow: "hidden", fontFamily: "Inter, Arial, sans-serif" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(circle at " + (24 + progress * 45) + "% 18%, " + accent + "55, transparent 31%), linear-gradient(135deg, " + dark + ", #050914 72%)",
      }} />
      <div style={{
        position: "absolute",
        inset: 0,
        opacity: 0.22,
        backgroundImage: "linear-gradient(" + accent + " 1px, transparent 1px), linear-gradient(90deg, " + accent + " 1px, transparent 1px)",
        backgroundSize: "64px 64px",
        transform: "translateX(" + (-sweep % 64) + "px) translateY(" + ((sweep / 2) % 64) + "px)",
      }} />
      <div style={{
        position: "absolute",
        left: 72,
        right: 72,
        top: 74,
        height: 10,
        background: "rgba(255,255,255,0.14)",
      }}>
        <div style={{ width: ((cut.index + progress) / total) * 100 + "%", height: "100%", background: accent }} />
      </div>
      <div style={{
        position: "absolute",
        right: 72,
        top: 112,
        color: accent,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 0,
      }}>BEAT {cut.index + 1} / {total}</div>
      <div style={{
        position: "absolute",
        left: 72,
        top: 136,
        color: accent,
        fontSize: 29,
        fontWeight: 900,
        letterSpacing: 0,
        opacity: fade,
        transform: "translateY(" + entrance + "px)",
      }}>{cut.eyebrow}</div>
      <div style={{
        position: "absolute",
        left: 72,
        top: 198,
        right: 72,
        color: "white",
        fontSize: titleSize,
        lineHeight: 1.02,
        fontWeight: 950,
        opacity: fade,
        transform: "translateY(" + entrance + "px)",
      }}>{cut.title}</div>
      <div style={{
        position: "absolute",
        left: 72,
        right: 72,
        top: 438,
        color: "#edf5ff",
        fontSize: bodySize,
        lineHeight: 1.18,
        fontWeight: 620,
        opacity: fade,
        transform: "translateY(" + (entrance * 0.7) + "px)",
      }}>{cut.body}</div>
      <MotionDiagram cut={cut} progress={progress} accent={accent} orbit={orbit} />
    </AbsoluteFill>
  );
}

function MotionDiagram({ cut, progress, accent, orbit }) {
  if (cut.index === 0) {
    return <CommandFlow progress={progress} accent={accent} />;
  }
  if (cut.index === 1) {
    return <PersonalUseCase progress={progress} accent={accent} orbit={orbit} />;
  }
  if (cut.index === 2) {
    return <PipelineFlow progress={progress} accent={accent} />;
  }
  return <NextStep progress={progress} accent={accent} />;
}

function CommandFlow({ progress, accent }) {
  const labels = ["init", "script", "render"];
  return (
    <div style={{ position: "absolute", left: 84, right: 84, bottom: 150, height: 230 }}>
      {labels.map((label, index) => {
        const local = interpolate(progress, [index * 0.18, index * 0.18 + 0.22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={label} style={{
            position: "absolute",
            left: index * 310,
            top: 52 + Math.sin(progress * Math.PI * 2 + index) * 12,
            width: 238,
            height: 108,
            border: "3px solid " + accent,
            background: "rgba(5,9,20,0.72)",
            color: "white",
            fontSize: 38,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: local,
            transform: "scale(" + (0.84 + local * 0.16) + ")",
          }}>{label}</div>
        );
      })}
      <div style={{ position: "absolute", left: 220, top: 102, width: 560 * progress, height: 5, background: accent }} />
    </div>
  );
}

function PersonalUseCase({ progress, accent, orbit }) {
  return (
    <div style={{ position: "absolute", left: 92, right: 92, bottom: 120, height: 280 }}>
      {[0, 1, 2].map((item) => (
        <div key={item} style={{
          position: "absolute",
          left: 90 + item * 230 + orbit * (item - 1),
          top: 62 + Math.sin(progress * Math.PI * 2 + item) * 30,
          width: 132,
          height: 132,
          borderRadius: 66,
          background: item === 1 ? accent : "rgba(255,255,255,0.12)",
          border: "3px solid " + accent,
          transform: "scale(" + (0.72 + progress * 0.28) + ")",
        }} />
      ))}
      <div style={{ position: "absolute", left: 190, top: 124, width: 430, height: 6, background: accent, transform: "scaleX(" + progress + ")", transformOrigin: "left" }} />
      <div style={{ position: "absolute", left: 182, top: 210, color: "white", fontSize: 30, fontWeight: 800 }}>user context to useful video</div>
    </div>
  );
}

function PipelineFlow({ progress, accent }) {
  const steps = ["show", "episode", "assets", "review"];
  return (
    <div style={{ position: "absolute", left: 90, right: 90, bottom: 130, height: 290 }}>
      {steps.map((step, index) => (
        <div key={step} style={{
          position: "absolute",
          left: (index % 2) * 480,
          top: Math.floor(index / 2) * 122,
          width: 350,
          height: 86,
          background: "rgba(255,255,255,0.1)",
          borderLeft: "9px solid " + accent,
          color: "white",
          fontSize: 34,
          fontWeight: 900,
          padding: "22px 28px",
          opacity: interpolate(progress, [index * 0.12, index * 0.12 + 0.18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          transform: "translateX(" + (26 - progress * 26) + "px)",
        }}>{step}</div>
      ))}
    </div>
  );
}

function NextStep({ progress, accent }) {
  return (
    <div style={{ position: "absolute", left: 92, right: 92, bottom: 142, height: 270 }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 36,
        width: 420 + progress * 360,
        height: 92,
        background: accent,
      }} />
      <div style={{
        position: "absolute",
        right: 0,
        top: 0,
        width: 250,
        height: 250,
        border: "8px solid white",
        transform: "rotate(" + (45 + progress * 90) + "deg)",
      }} />
      <div style={{ position: "absolute", left: 28, top: 54, color: "#07111f", fontSize: 42, fontWeight: 950 }}>ready to iterate</div>
    </div>
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

function starterCardCopy(value: string): { eyebrow: string; title: string; body: string } {
  const cleaned = value.replace(/^Generated deterministic zero-key idea card:\s*/iu, "");
  const parts = cleaned.split("|").map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3) {
    return {
      eyebrow: parts[0] ?? "NO-KEY FIRST VIDEO",
      title: parts[1] ?? "Animated First Video",
      body: parts.slice(2).join(" | "),
    };
  }

  const fallbackTitle = parts[0] ?? cleaned.slice(0, 56);

  return {
    eyebrow: "NO-KEY FIRST VIDEO",
    title: fallbackTitle || "Animated First Video",
    body: parts[1] ?? cleaned,
  };
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
