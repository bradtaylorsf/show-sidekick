import { execFile } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  AssetManifestSchema,
  CuesheetSchema,
  DeckManifestSchema,
  EditDecisionsSchema,
  PlaybookSchema,
  RenderReportSchema,
  ScenePlanSchema,
  type RenderReport,
} from "../artifacts/index.js";
import { playbookToCssVariables } from "../compose/hyperframes-style-bridge.js";
import {
  overlayTimelineFrames,
  renderResolvedOverlayFrame,
  ResolvedComposeOverlaySchema,
  type ResolvedComposeOverlay,
} from "../compose/overlay-recipe.js";
import { cuesheetToWords, SlideScenePropsSchema, validateCaptionFrameSync, type SceneNode } from "../remotion/index.js";
import { defineTool, type ToolAvailabilityContext } from "../registry/index.js";

const require = createRequire(import.meta.url);

export const RemotionComposeInputSchema = z.object({
  edit_decisions: EditDecisionsSchema,
  asset_manifest: AssetManifestSchema.optional(),
  deck_manifest: DeckManifestSchema.optional(),
  scene_plan: ScenePlanSchema.optional(),
  output_path: z.string().optional(),
  cuesheet: CuesheetSchema.optional(),
  playbook: PlaybookSchema.optional(),
  planned_duration_s: z.number().positive().optional(),
  expected_duration_s: z.number().positive().optional(),
  fps: z.number().positive().default(30),
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  debug_overlay: z.enum(["none", "beats", "all"]).default("none"),
});

export type RemotionComposeInput = z.infer<typeof RemotionComposeInputSchema>;
export type RemotionSlideSceneTimelineProps = {
  cutIndex: number;
  startFrame: number;
  durationFrames: number;
  asset_id: string;
  scene_id?: string;
  props: z.output<typeof SlideScenePropsSchema>;
};

export type RemotionOverlayTimelineProps = {
  index: number;
  component: string;
  registry: "overlay" | "scene";
  startFrame: number;
  durationFrames: number;
  captionBurn: boolean;
  node?: SceneNode;
};

export function buildRemotionSlideSceneProps(params: RemotionComposeInput): RemotionSlideSceneTimelineProps[] {
  const input = RemotionComposeInputSchema.parse(params);
  const assets = new Map(input.asset_manifest?.assets.map((asset) => [asset.id, asset]) ?? []);
  const slides = new Map(input.deck_manifest?.slides.map((slide) => [slide.id, slide]) ?? []);
  const scenes = input.scene_plan?.scenes ?? [];
  const resolution = input.resolution ?? { width: 1920, height: 1080 };

  return input.edit_decisions.cuts.flatMap((cut, cutIndex) => {
    const scene = sceneForCut(cut, scenes);
    const slideId = cut.slide_id ?? cut.slide_ids[0] ?? scene?.slide_id ?? scene?.slide_ids[0];
    const asset = assets.get(cut.asset_id);
    const slide = slideId === undefined ? undefined : slides.get(slideId);
    const imagePath = asset?.path ?? slide?.image_path;
    const isSlideCut = cut.scene_kind === "slide_scene" || slideId !== undefined || scene?.treatment === "slide_image";

    if (!isSlideCut || slideId === undefined || imagePath === undefined) {
      return [];
    }

    const durationFrames = Math.max(1, Math.round((cut.end_s - cut.start_s) * input.fps));
    const props = SlideScenePropsSchema.parse({
      slide_id: slideId,
      image_path: imagePath,
      title: scene?.scene_anchor ?? slideId,
      caption: cut.caption ?? scene?.caption,
      focus_rect: cut.focus_rect ?? scene?.focus_rect,
      motion: cut.motion ?? motionForScene(scene),
      highlights: cut.highlights.length > 0 ? cut.highlights : scene?.highlights ?? [],
      callouts: cut.callouts.length > 0 ? cut.callouts : scene?.callouts ?? [],
      fps: input.fps,
      duration_frames: durationFrames,
      width: resolution.width,
      height: resolution.height,
    });

    return [
      {
        cutIndex,
        startFrame: Math.round(cut.start_s * input.fps),
        durationFrames,
        asset_id: cut.asset_id,
        scene_id: cut.scene_id ?? scene?.slug,
        props,
      },
    ];
  });
}

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
    if (parsed.edit_decisions.render_runtime !== "remotion") {
      throw new Error(
        `remotion compose refuses runtime swap: edit_decisions.render_runtime must be remotion, found ${parsed.edit_decisions.render_runtime}`,
      );
    }

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
    const expectedDuration = parsed.expected_duration_s ?? parsed.planned_duration_s ?? duration;
    const driftS = roundSeconds(Math.abs(duration - expectedDuration));
    const driftToleranceS = 0.2;
    const slideSceneCount = buildRemotionSlideSceneProps(parsed).length;
    const verificationNotes = [
      "Runtime locked to remotion from edit_decisions.",
      parsed.cuesheet === undefined ? "No cuesheet supplied; captions/audio timing not embedded." : "Cuesheet supplied; captions and narration timing embedded.",
      slideSceneCount > 0
        ? `${slideSceneCount} slide scene(s) mapped to deck or asset imagery with motion props.`
        : "No slide_scene cuts found; generic Remotion scene fallback used.",
    ];

    if (parsed.asset_manifest !== undefined) {
      const rendered = await renderWithRemotionCli(parsed, ctx.projectRoot, duration, expectedDuration);
      validationSteps.push({
        name: "remotion_render",
        status: "pass",
        notes: "Rendered a project-local Remotion composition from edit_decisions and asset_manifest.",
      });

      return RenderReportSchema.parse({
        ...rendered,
        expected_duration_s: expectedDuration,
        drift_s: driftS,
        drift_frames: Math.round(driftS * parsed.fps),
        drift_tolerance_s: driftToleranceS,
        within_tolerance: driftS <= driftToleranceS,
        verification_notes: verificationNotes,
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
      expected_duration_s: expectedDuration,
      drift_s: driftS,
      drift_frames: Math.round(driftS * parsed.fps),
      drift_tolerance_s: driftToleranceS,
      within_tolerance: driftS <= driftToleranceS,
      warnings: [],
      verification_notes: verificationNotes,
      validation_steps: validationSteps,
    });
  },
});

type RemotionCut = RemotionComposeInput["edit_decisions"]["cuts"][number];
type RemotionScene = NonNullable<RemotionComposeInput["scene_plan"]>["scenes"][number];

function sceneForCut(cut: RemotionCut, scenes: RemotionScene[]): RemotionScene | undefined {
  if (cut.scene_id !== undefined) {
    const exact = scenes.find((scene) => scene.slug === cut.scene_id);
    if (exact !== undefined) {
      return exact;
    }
  }

  const slideId = cut.slide_id ?? cut.slide_ids[0];
  if (slideId !== undefined) {
    const bySlide = scenes.find((scene) => scene.slide_id === slideId || scene.slide_ids.includes(slideId));
    if (bySlide !== undefined) {
      return bySlide;
    }
  }

  return undefined;
}

function motionForScene(
  scene: RemotionScene | undefined,
): { type: "push_in" | "pull_out" | "pan_left" | "pan_right" | "pan_up" | "pan_down" | "static"; zoom_start?: number; zoom_end?: number } {
  const movement = scene?.shot_language.camera_movement;
  if (movement === "pan_left" || movement === "pan_right" || movement === "push_in" || movement === "pull_out") {
    return { type: movement };
  }
  if (movement === "tilt_up") {
    return { type: "pan_up" };
  }
  if (movement === "tilt_down") {
    return { type: "pan_down" };
  }
  if (scene?.treatment === "slide_image") {
    return { type: "static", zoom_start: 1, zoom_end: 1 };
  }

  return { type: "push_in", zoom_start: 1, zoom_end: 1.08 };
}

async function renderWithRemotionCli(
  input: RemotionComposeInput,
  projectRoot: string,
  durationS: number,
  expectedDurationS: number,
): Promise<Omit<RenderReport, "validation_steps">> {
  const outputPath = resolveAssetPath(input.output_path ?? "renders/remotion.mp4", projectRoot);
  const workspace = join(projectRoot, ".show-sidekick-work", `remotion-${Date.now()}`);
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
      "ShowSidekickSample",
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
    expected_duration_s: expectedDurationS,
    drift_s: roundSeconds(Math.abs(durationS - expectedDurationS)),
    drift_frames: Math.round(Math.abs(durationS - expectedDurationS) * input.fps),
    drift_tolerance_s: 0.2,
    within_tolerance: Math.abs(durationS - expectedDurationS) <= 0.2,
    verification_notes: [
      "Runtime locked to remotion from edit_decisions.",
      input.cuesheet === undefined ? "No cuesheet supplied; captions/audio timing not embedded." : "Cuesheet supplied; captions and narration timing embedded.",
    ],
  };
}

function remotionEntrySource(
  input: RemotionComposeInput,
  projectRoot: string,
  durationInFrames: number,
  resolution: { width: number; height: number },
  media: RemotionMediaMap,
): string {
  const props = buildRemotionCompositionProps(input, projectRoot, resolution, media);

  return `
import React from "react";
import { AbsoluteFill, Audio, Composition, Img, OffthreadVideo, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame } from "remotion";

const props = ${JSON.stringify(props)};

function mediaUrl(src, useStaticFile) {
  return useStaticFile ? staticFile(src) : src;
}
${remotionSceneSource(durationInFrames)}`;
}

export function buildRemotionCompositionProps(
  params: RemotionComposeInput,
  projectRoot = "/",
  resolutionOverride?: { width: number; height: number },
  media: RemotionMediaMap = new Map(),
): {
  fps: number;
  animationFirst: boolean;
  cuts: Array<Record<string, unknown>>;
  captions: Array<{ index: number; text: string; startFrame: number; endFrame: number }>;
  overlays: RemotionOverlayTimelineProps[];
  audioSrc?: string;
  audioUsesStaticFile: boolean;
  width: number;
  height: number;
  showBeatCounter: boolean;
} {
  const input = RemotionComposeInputSchema.parse(params);
  const assets = new Map(input.asset_manifest?.assets.map((asset) => [asset.id, asset]) ?? []);
  const scenes = input.scene_plan?.scenes ?? [];
  const slideScenes = buildRemotionSlideSceneProps(input);
  const slideScenesByCutIndex = new Map(slideScenes.map((scene) => [scene.cutIndex, scene]));
  const captionWords = captionWordsForInput(input).map((word, index) => ({
    index,
    text: word.text,
    startFrame: Math.round(word.start_s * input.fps),
    endFrame: Math.round(word.end_s * input.fps),
  }));
  const audioPath = input.edit_decisions.audio?.music?.track_path ?? input.cuesheet?.audio.path;
  const audioSource = audioPath ? mediaSrc(audioPath, projectRoot, media) : undefined;
  const resolution = resolutionOverride ?? input.resolution ?? { width: 1920, height: 1080 };
  const hasCaptionTrack = captionWords.length > 0;
  const durationFrames = Math.max(1, Math.ceil(input.edit_decisions.cuts.reduce((max, cut) => Math.max(max, cut.end_s), 0) * input.fps));
  const overlays = buildRemotionOverlayProps(input, durationFrames);

  return {
    fps: input.fps,
    animationFirst: input.edit_decisions.renderer_family === "animation-first",
    cuts: input.edit_decisions.cuts.map((cut, index) => {
      const asset = assets.get(cut.asset_id);
      const scene = sceneForCut(cut, scenes);
      const source = asset?.path ? mediaSrc(asset.path, projectRoot, media) : undefined;
      const slideScene = slideScenesByCutIndex.get(index);
      const displayText = cut.caption ?? scene?.caption ?? asset?.prompt ?? cut.asset_id;
      const card = starterCardCopy(displayText);
      const slide =
        slideScene === undefined
          ? undefined
          : {
              ...slideScene.props,
              imageSrc: mediaSrc(slideScene.props.image_path, projectRoot, media).src,
              imageUsesStaticFile: mediaSrc(slideScene.props.image_path, projectRoot, media).useStaticFile,
            };
      return {
        index,
        startFrame: Math.round(cut.start_s * input.fps),
        durationFrames: Math.max(1, Math.round((cut.end_s - cut.start_s) * input.fps)),
        sceneKind: cut.scene_kind,
        src: source?.src,
        useStaticFile: source?.useStaticFile ?? false,
        kind: asset?.kind ?? "video",
        label: displayText,
        caption: cut.caption ?? scene?.caption,
        eyebrow: card.eyebrow,
        title: card.title,
        body: card.body,
        showSceneCopy: !hasCaptionTrack || cut.caption === undefined,
        slide,
      };
    }),
    captions: captionWords,
    overlays,
    audioSrc: audioSource?.src,
    audioUsesStaticFile: audioSource?.useStaticFile ?? false,
    width: resolution.width,
    height: resolution.height,
    showBeatCounter: input.debug_overlay === "beats" || input.debug_overlay === "all",
  };
}

function buildRemotionOverlayProps(input: RemotionComposeInput, durationFrames: number): RemotionOverlayTimelineProps[] {
  return input.edit_decisions.overlays.flatMap((candidate, index) => {
    const parsed = ResolvedComposeOverlaySchema.safeParse(candidate);
    if (!parsed.success) {
      return [];
    }

    const overlay = parsed.data;
    const timing = overlayTimelineFrames(overlay.timeline, input.fps, durationFrames);
    return [
      {
        index,
        component: overlay.component,
        registry: overlay.registry,
        startFrame: timing.startFrame,
        durationFrames: timing.durationFrames,
        captionBurn: overlay.registry === "overlay" && overlay.component === "caption_burn",
        node: renderOverlayNode(overlay),
      },
    ];
  });
}

function renderOverlayNode(overlay: ResolvedComposeOverlay): SceneNode {
  const frame = 18;
  return renderResolvedOverlayFrame([overlay], frame);
}

function remotionSceneSource(durationInFrames: number): string {
  return `
function Scene({ cut, total }) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, cut.durationFrames - 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (cut.slide) {
    return <SlideDeckScene cut={cut} progress={progress} frame={frame} />;
  }
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
      {cut.showSceneCopy ? <div style={{
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
      }}>{title}</div> : null}
      {props.showBeatCounter ? <div style={{
        position: "absolute",
        right: 76,
        top: 64,
        color: "#8ee8ff",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 24,
        letterSpacing: 0,
        fontWeight: 700,
      }}>BEAT {cut.index + 1} / {total}</div> : null}
    </AbsoluteFill>
  );
}

function SlideDeckScene({ cut, progress, frame }) {
  const slide = cut.slide;
  const imageSrc = mediaUrl(slide.imageSrc, slide.imageUsesStaticFile);
  const motionType = slide.motion?.type || "push_in";
  const zoomStart = slide.motion?.zoom_start || 1;
  const zoomEnd = slide.motion?.zoom_end || 1.08;
  const scale = motionType === "pull_out"
    ? interpolate(progress, [0, 1], [zoomEnd, zoomStart], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : motionType === "static"
      ? zoomStart
      : interpolate(progress, [0, 1], [zoomStart, zoomEnd], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pan = panForSlideMotion(motionType, progress);
  const fade = interpolate(frame, [0, 10, Math.max(12, cut.durationFrames - 10), cut.durationFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#07111f", overflow: "hidden", fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{
        position: "absolute",
        left: 84,
        top: 48,
        right: 84,
        bottom: 116,
        background: "#0f1d32",
        border: "2px solid rgba(147,164,186,0.28)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 22px 60px rgba(0,0,0,0.34)",
      }}>
        <Img src={imageSrc} style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: "scale(" + scale + ") translate(" + pan.x + "%, " + pan.y + "%)",
          transformOrigin: focusOrigin(slide.focus_rect),
        }} />
        {slide.highlights.map((highlight, index) => (
          <div key={"highlight-" + index} style={{
            position: "absolute",
            left: (highlight.rect.x * 100) + "%",
            top: (highlight.rect.y * 100) + "%",
            width: (highlight.rect.width * 100) + "%",
            height: (highlight.rect.height * 100) + "%",
            border: "5px solid #f59e0b",
            borderRadius: highlight.shape === "ellipse" ? "999px" : 8,
            boxShadow: "0 0 0 9999px rgba(7,17,31,0.18)",
            opacity: fade,
          }} />
        ))}
        {slide.callouts.map((callout, index) => (
          <div key={"callout-" + index} style={{
            position: "absolute",
            right: callout.anchor === "right" ? 28 : "auto",
            left: callout.anchor === "left" ? 28 : callout.anchor === "top" || callout.anchor === "bottom" ? 92 + index * 420 : "auto",
            top: callout.anchor === "top" ? 28 : callout.anchor === "bottom" ? "auto" : 76 + index * 92,
            bottom: callout.anchor === "bottom" ? 28 : "auto",
            maxWidth: 430,
            background: "#2dd4bf",
            color: "#07111f",
            borderRadius: 8,
            padding: "18px 22px",
            fontSize: 25,
            lineHeight: 1.15,
            fontWeight: 850,
            opacity: fade,
          }}>{callout.text}</div>
        ))}
      </div>
      <div style={{
        position: "absolute",
        left: 84,
        bottom: 46,
        color: "#f8fafc",
        fontSize: 34,
        fontWeight: 850,
        letterSpacing: 0,
        opacity: fade,
      }}>{slide.title || slide.slide_id}</div>
      {slide.caption ? <div style={{
        position: "absolute",
        right: 84,
        bottom: 46,
        maxWidth: 760,
        color: "#dbeafe",
        fontSize: 26,
        lineHeight: 1.18,
        textAlign: "right",
        opacity: fade,
      }}>{slide.caption}</div> : null}
    </AbsoluteFill>
  );
}

function panForSlideMotion(type, progress) {
  const amount = 2.8;
  if (type === "pan_left") {
    return { x: -amount * progress, y: 0 };
  }
  if (type === "pan_right") {
    return { x: amount * progress, y: 0 };
  }
  if (type === "pan_up") {
    return { x: 0, y: -amount * progress };
  }
  if (type === "pan_down") {
    return { x: 0, y: amount * progress };
  }
  return { x: 0, y: 0 };
}

function focusOrigin(rect) {
  if (!rect) {
    return "50% 50%";
  }
  return Math.round((rect.x + rect.width / 2) * 100) + "% " + Math.round((rect.y + rect.height / 2) * 100) + "%";
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
      {props.showBeatCounter ? <div style={{
        position: "absolute",
        right: 72,
        top: 112,
        color: accent,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 0,
      }}>BEAT {cut.index + 1} / {total}</div> : null}
      {cut.showSceneCopy ? <>
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
      </> : null}
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

function OverlayLayer({ overlay }) {
  return (
    <div data-overlay-component={overlay.component} data-overlay-registry={overlay.registry} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <SceneNodeLayer node={overlay.node} />
    </div>
  );
}

function SceneNodeLayer({ node }) {
  if (node === null || node === undefined) {
    return null;
  }

  if (typeof node !== "object") {
    return String(node);
  }

  const nodeProps = node.props || {};
  if (node.type === "scene-meta") {
    return null;
  }

  const style = sceneNodeStyle(node);
  const text = sceneNodeText(node);
  const children = node.children || [];

  return (
    <div data-scene-node={node.type} style={style}>
      {text}
      {children.map((child, index) => <SceneNodeLayer key={index} node={child} />)}
    </div>
  );
}

function sceneNodeText(node) {
  const nodeProps = node.props || {};
  if (nodeProps.text !== undefined) {
    return String(nodeProps.text);
  }
  if (node.type === "provider-chip") {
    return [nodeProps.provider, nodeProps.model, nodeProps.status].filter(Boolean).join(" ");
  }
  if (node.type === "caption-word") {
    return String(nodeProps.text || "");
  }
  return null;
}

function sceneNodeStyle(node) {
  const nodeProps = node.props || {};
  const baseStyle = nodeProps.style || {};
  if (node.type === "caption-box") {
    return {
      position: "absolute",
      left: "16%",
      right: "16%",
      padding: "14px 20px",
      borderRadius: 8,
      lineHeight: 1.18,
      textAlign: "center",
      textShadow: "0 2px 8px rgba(0,0,0,0.55)",
      ...captionPositionStyle(nodeProps.position),
      ...baseStyle,
    };
  }
  if (node.type === "caption-line") {
    return { display: "block" };
  }
  if (node.type === "caption-word") {
    return {
      color: nodeProps.color,
      display: "inline-block",
      marginRight: 8,
    };
  }
  return baseStyle;
}

function captionPositionStyle(position) {
  if (position === "top") {
    return { top: 42 };
  }
  if (position === "center") {
    return { top: "50%", transform: "translateY(-50%)" };
  }
  return { bottom: 26 };
}

function ShowSidekickSample({ cuts, audioSrc }) {
  const hasRecipeCaptionBurn = props.overlays.some((overlay) => overlay.captionBurn);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020" }}>
      {cuts.map((cut) => (
        <Sequence key={cut.index} from={cut.startFrame} durationInFrames={cut.durationFrames}>
          <Scene cut={cut} total={cuts.length} />
        </Sequence>
      ))}
      {audioSrc ? <Audio src={mediaUrl(audioSrc, props.audioUsesStaticFile)} /> : null}
      {props.overlays.map((overlay) => (
        <Sequence key={"overlay-" + overlay.index} from={overlay.startFrame} durationInFrames={overlay.durationFrames}>
          <OverlayLayer overlay={overlay} />
        </Sequence>
      ))}
      {props.captions.length > 0 && !hasRecipeCaptionBurn ? <CaptionLayer /> : null}
    </AbsoluteFill>
  );
}

function CaptionLayer() {
  const frame = useCurrentFrame();
  const active = props.captions.find((word, index) => {
    const isLast = index === props.captions.length - 1;
    return frame >= word.startFrame && (frame < word.endFrame || (isLast && frame <= word.endFrame));
  });

  if (!active) {
    return null;
  }

  const nearby = props.captions
    .filter((word) => Math.abs(word.index - active.index) <= 4)
    .map((word) => word.text)
    .join(" ");

  return (
    <div style={{
      position: "absolute",
      left: "16%",
      right: "16%",
      bottom: 26,
      padding: "14px 20px",
      background: "rgba(7, 17, 31, 0.78)",
      color: "#f8fafc",
      fontFamily: "Inter, Arial, sans-serif",
      fontSize: 29,
      lineHeight: 1.18,
      textAlign: "center",
      textShadow: "0 2px 8px rgba(0,0,0,0.55)",
    }}>{nearby}</div>
  );
}

export const RemotionRoot = () => (
  <Composition
    id="ShowSidekickSample"
    component={ShowSidekickSample}
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

function captionWordsForInput(input: RemotionComposeInput): Array<{ text: string; start_s: number; end_s: number }> {
  if (input.cuesheet !== undefined) {
    return cuesheetToWords(input.cuesheet);
  }

  return input.edit_decisions.cuts.flatMap((cut) => wordsFromCutCaption(cut));
}

function wordsFromCutCaption(cut: RemotionCut): Array<{ text: string; start_s: number; end_s: number }> {
  const words = cut.caption?.match(/\S+/gu) ?? [];
  if (words.length === 0) {
    return [];
  }

  const duration = Math.max(0.001, cut.end_s - cut.start_s);
  const wordDuration = duration / words.length;

  return words.map((word, index) => ({
    text: word,
    start_s: cut.start_s + index * wordDuration,
    end_s: Math.min(cut.end_s, cut.start_s + (index + 1) * wordDuration),
  }));
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
  const slideSceneImagePaths = buildRemotionSlideSceneProps(input).map((scene) => scene.props.image_path);
  const values = [
    ...(input.asset_manifest?.assets.map((asset) => asset.path).filter(Boolean) ?? []),
    input.edit_decisions.audio?.music?.track_path,
    input.cuesheet?.audio.path,
    ...slideSceneImagePaths,
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

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
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
