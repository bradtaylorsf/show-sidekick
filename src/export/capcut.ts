import path from "node:path";
import type { Cuesheet, EditDecisions, RenderReport } from "../artifacts/index.js";
import { atomicWrite } from "../checkpoints/io.js";
import type { LinkedAudioTrack, LinkedTimelineAsset } from "./fcp7-xml.js";

export type CapcutExporterOptions = {
  packageDir: string;
  projectName: string;
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  renderReport: RenderReport;
  assets: LinkedTimelineAsset[];
  audioTracks: LinkedAudioTrack[];
};

export type CapcutExporterResult = {
  timelinePath: string;
  readmePath: string;
};

type CapcutTimerange = {
  start_us: number;
  duration_us: number;
};

type CapcutMaterial = {
  id: string;
  type: "video" | "image" | "audio" | "text";
  name: string;
  path?: string;
  duration_us?: number;
  text?: string;
  source_asset_id?: string;
};

type CapcutSegment = {
  id: string;
  material_id: string;
  source_timerange_us: CapcutTimerange;
  target_timerange_us: CapcutTimerange;
  asset_id?: string;
  text?: string;
  notes?: string;
};

type CapcutTrack = {
  id: string;
  type: "video" | "audio" | "text";
  segments: CapcutSegment[];
};

type CaptionCue = {
  text: string;
  start_s: number;
  end_s: number;
};

export type CapcutDraft = {
  version: 1;
  type: "capcut_draft";
  project: {
    name: string;
    duration_us: number;
    fps: number;
    canvas: {
      width: number;
      height: number;
    };
  };
  materials: {
    all: CapcutMaterial[];
    videos: CapcutMaterial[];
    images: CapcutMaterial[];
    audios: CapcutMaterial[];
    captions: CapcutMaterial[];
  };
  tracks: CapcutTrack[];
};

export async function exportCapcut(options: CapcutExporterOptions): Promise<CapcutExporterResult> {
  const timelinePath = path.join(options.packageDir, "draft.json");
  const readmePath = path.join(options.packageDir, "README.md");

  await atomicWrite(timelinePath, `${JSON.stringify(buildCapcutDraft(options), null, 2)}\n`);
  await atomicWrite(readmePath, capcutReadme(options.projectName));

  return { timelinePath, readmePath };
}

export function buildCapcutDraft(options: CapcutExporterOptions): CapcutDraft {
  const cuts = [...options.editDecisions.cuts].sort((left, right) => left.start_s - right.start_s || left.end_s - right.end_s);
  if (cuts.length === 0) {
    throw new Error("cannot export CapCut draft because edit_decisions.cuts is empty");
  }

  const assetsById = new Map(options.assets.map((asset) => [asset.id, asset]));
  const timelineMaterials = options.assets.map((asset) => timelineMaterial(asset));
  const audioMaterials = options.audioTracks.map((track, index) => audioMaterial(track, index));
  const captions = captionCues(options.cuesheet);
  const captionMaterials = captions.map((caption, index) => captionMaterial(caption, index));
  const materialByAssetId = new Map(timelineMaterials.map((material) => [material.source_asset_id, material]));
  const materialByAudioId = new Map(options.audioTracks.map((track, index) => [track.id, audioMaterials[index]]));

  const videoTrack: CapcutTrack = {
    id: "track-video-1",
    type: "video",
    segments: cuts.map((cut, index) => {
      const asset = assetsById.get(cut.asset_id);
      if (asset === undefined) {
        throw new Error(`asset_manifest does not contain cut asset '${cut.asset_id}'`);
      }

      const material = materialByAssetId.get(asset.id);
      if (material === undefined) {
        throw new Error(`CapCut material missing for cut asset '${cut.asset_id}'`);
      }

      const durationUs = secondsToMicroseconds(cut.end_s - cut.start_s);
      const notes = timingAnchorNote(cut);

      return {
        id: `video-segment-${index + 1}`,
        material_id: material.id,
        asset_id: asset.id,
        source_timerange_us: {
          start_us: 0,
          duration_us: durationUs,
        },
        target_timerange_us: {
          start_us: secondsToMicroseconds(cut.start_s),
          duration_us: durationUs,
        },
        ...(notes === undefined ? {} : { notes: `ANCHOR: ${notes}` }),
      };
    }),
  };

  const audioTracks: CapcutTrack[] = options.audioTracks.map((track, index) => {
    const material = materialByAudioId.get(track.id);
    if (material === undefined) {
      throw new Error(`CapCut material missing for audio track '${track.id}'`);
    }

    const durationUs = secondsToMicroseconds(track.duration_s);

    return {
      id: `track-audio-${index + 1}`,
      type: "audio",
      segments: [
        {
          id: `audio-segment-${index + 1}`,
          material_id: material.id,
          source_timerange_us: {
            start_us: 0,
            duration_us: durationUs,
          },
          target_timerange_us: {
            start_us: 0,
            duration_us: durationUs,
          },
        },
      ],
    };
  });

  const captionTrack: CapcutTrack = {
    id: "track-captions-1",
    type: "text",
    segments: captions.map((caption, index) => {
      const durationUs = secondsToMicroseconds(caption.end_s - caption.start_s);

      return {
        id: `caption-segment-${index + 1}`,
        material_id: captionMaterials[index]?.id ?? `caption-${index + 1}`,
        source_timerange_us: {
          start_us: 0,
          duration_us: durationUs,
        },
        target_timerange_us: {
          start_us: secondsToMicroseconds(caption.start_s),
          duration_us: durationUs,
        },
        text: caption.text,
      };
    }),
  };

  const allMaterials = [...timelineMaterials, ...audioMaterials, ...captionMaterials];

  return {
    version: 1,
    type: "capcut_draft",
    project: {
      name: options.projectName,
      duration_us: secondsToMicroseconds(options.renderReport.duration_s),
      fps: options.renderReport.framerate,
      canvas: {
        width: options.renderReport.resolution.width,
        height: options.renderReport.resolution.height,
      },
    },
    materials: {
      all: allMaterials,
      videos: allMaterials.filter((material) => material.type === "video"),
      images: allMaterials.filter((material) => material.type === "image"),
      audios: allMaterials.filter((material) => material.type === "audio"),
      captions: allMaterials.filter((material) => material.type === "text"),
    },
    tracks: [videoTrack, ...audioTracks, captionTrack],
  };
}

function timelineMaterial(asset: LinkedTimelineAsset): CapcutMaterial {
  const type = materialType(asset);

  return {
    id: `asset-${safeIdentifier(asset.id)}`,
    type,
    name: path.basename(asset.linked_path) || asset.id,
    path: path.resolve(asset.linked_path),
    source_asset_id: asset.id,
  };
}

function audioMaterial(track: LinkedAudioTrack, index: number): CapcutMaterial {
  return {
    id: `audio-${index + 1}`,
    type: "audio",
    name: track.name,
    path: path.resolve(track.linked_path),
    duration_us: secondsToMicroseconds(track.duration_s),
  };
}

function captionMaterial(caption: CaptionCue, index: number): CapcutMaterial {
  return {
    id: `caption-${index + 1}`,
    type: "text",
    name: `Caption ${index + 1}`,
    text: caption.text,
    duration_us: secondsToMicroseconds(caption.end_s - caption.start_s),
  };
}

function materialType(asset: LinkedTimelineAsset): "video" | "image" | "audio" {
  const kind = asset.kind.toLowerCase();
  if (kind.includes("image") || kind.includes("still") || /\.(avif|gif|jpe?g|png|webp)$/iu.test(asset.path)) {
    return "image";
  }
  if (kind.includes("audio") || /\.(aac|aiff?|flac|m4a|mp3|ogg|wav)$/iu.test(asset.path)) {
    return "audio";
  }

  return "video";
}

function captionCues(cuesheet: Cuesheet): CaptionCue[] {
  const wordCues =
    cuesheet.words
      ?.map((word) => ({ text: word.text, start_s: word.start_s, end_s: word.end_s }))
      .filter((word) => word.text.trim() !== "" && word.end_s > word.start_s) ?? [];

  if (wordCues.length > 0) {
    return wordCues;
  }

  return cuesheet.segments
    .map((segment) => ({ text: segment.text, start_s: segment.start_s, end_s: segment.end_s }))
    .filter((segment) => segment.text.trim() !== "" && segment.end_s > segment.start_s);
}

function timingAnchorNote(cut: EditDecisions["cuts"][number]): string | undefined {
  const parts = [
    cut.timing_source === undefined || cut.timing_anchor === undefined
      ? undefined
      : `${cut.timing_source}:${cut.timing_anchor}`,
    timingRefNote(cut.timing_ref),
  ].filter((part): part is string => part !== undefined && part.trim() !== "");

  return parts.length === 0 ? undefined : parts.join(" ");
}

function timingRefNote(ref: EditDecisions["cuts"][number]["timing_ref"]): string | undefined {
  if (ref === undefined) {
    return undefined;
  }

  const parts = [
    ref.lyric_line_id === undefined ? undefined : `lyric_line_id=${ref.lyric_line_id}`,
    ref.word_id === undefined ? undefined : `word_id=${ref.word_id}`,
    ref.beat_index === undefined ? undefined : `beat_index=${ref.beat_index}`,
    ref.climax_index === undefined ? undefined : `climax_index=${ref.climax_index}`,
  ].filter((part): part is string => part !== undefined);

  return parts.length === 0 ? undefined : `(${parts.join(",")})`;
}

function secondsToMicroseconds(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1_000_000));
}

function safeIdentifier(value: string): string {
  return value.replace(/[^a-z0-9_-]+/giu, "_").replace(/^_+|_+$/gu, "") || "asset";
}

function capcutReadme(projectName: string): string {
  return [
    `# ${projectName} CapCut Draft`,
    "",
    "Open CapCut, create a new project, and import `draft.json` from this folder when using CapCut desktop draft import.",
    "If your CapCut build does not expose draft import, import the files from `assets/` and use the JSON timeline as the cut and caption reference.",
    "Keep the `assets/` directory beside `draft.json` unless this package was exported in reference mode.",
    "",
  ].join("\n");
}
