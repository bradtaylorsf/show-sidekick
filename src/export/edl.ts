import path from "node:path";
import type { Cuesheet, EditDecisions, RenderReport } from "../artifacts/index.js";
import { atomicWrite } from "../checkpoints/io.js";
import type { LinkedAudioTrack, LinkedTimelineAsset } from "./fcp7-xml.js";

export type EdlExporterOptions = {
  packageDir: string;
  projectName: string;
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  renderReport: RenderReport;
  assets: LinkedTimelineAsset[];
  audioTracks: LinkedAudioTrack[];
};

export type EdlExporterResult = {
  timelinePath: string;
  readmePath: string;
};

type ReelState = {
  byKey: Map<string, string>;
  next: number;
};

export async function exportEdl(options: EdlExporterOptions): Promise<EdlExporterResult> {
  const timelinePath = path.join(options.packageDir, "timeline.edl");
  const readmePath = path.join(options.packageDir, "README.md");

  await atomicWrite(timelinePath, buildEdl(options));
  await atomicWrite(readmePath, edlReadme(options.projectName));

  return { timelinePath, readmePath };
}

export function buildEdl(options: EdlExporterOptions): string {
  const cuts = [...options.editDecisions.cuts].sort((left, right) => left.start_s - right.start_s || left.end_s - right.end_s);
  if (cuts.length === 0) {
    throw new Error("cannot export EDL because edit_decisions.cuts is empty");
  }

  const assetsById = new Map(options.assets.map((asset) => [asset.id, asset]));
  const reelState: ReelState = { byKey: new Map(), next: 1 };
  const dropFrame = usesDropFrameNumbering(options.renderReport.framerate);
  const lines = [`TITLE: ${sanitizeTitle(options.projectName)}`, `FCM: ${dropFrame ? "DROP FRAME" : "NON-DROP FRAME"}`, ""];
  let eventNumber = 1;

  for (const cut of cuts) {
    const asset = assetsById.get(cut.asset_id);
    if (asset === undefined) {
      throw new Error(`asset_manifest does not contain cut asset '${cut.asset_id}'`);
    }

    const eventNumberForCut = eventNumber++;
    lines.push(
      eventLine({
        eventNumber: eventNumberForCut,
        reelId: reelIdFor(reelState, `asset:${asset.id}`),
        channel: "V",
        sourceStartS: 0,
        sourceEndS: cut.end_s - cut.start_s,
        recordStartS: cut.start_s,
        recordEndS: cut.end_s,
        framerate: options.renderReport.framerate,
        dropFrame,
      }),
    );
    const anchor = timingAnchorNote(cut);
    if (anchor !== undefined) {
      lines.push(`* ANCHOR: ${anchor}`);
    }
  }

  for (const track of options.audioTracks) {
    const durationS = Math.min(track.duration_s, options.renderReport.duration_s);
    lines.push(
      eventLine({
        eventNumber: eventNumber++,
        reelId: reelIdFor(reelState, `audio:${track.id}:${track.linked_path}`),
        channel: "A",
        sourceStartS: 0,
        sourceEndS: durationS,
        recordStartS: 0,
        recordEndS: durationS,
        framerate: options.renderReport.framerate,
        dropFrame,
      }),
    );
  }

  return `${lines.join("\n")}\n`;
}

function eventLine(options: {
  eventNumber: number;
  reelId: string;
  channel: "V" | "A";
  sourceStartS: number;
  sourceEndS: number;
  recordStartS: number;
  recordEndS: number;
  framerate: number;
  dropFrame: boolean;
}): string {
  return [
    String(options.eventNumber).padStart(3, "0"),
    options.reelId,
    options.channel,
    "C",
    smpteTimecode(options.sourceStartS, options.framerate, options.dropFrame),
    smpteTimecode(options.sourceEndS, options.framerate, options.dropFrame),
    smpteTimecode(options.recordStartS, options.framerate, options.dropFrame),
    smpteTimecode(options.recordEndS, options.framerate, options.dropFrame),
  ].join("  ");
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

function reelIdFor(state: ReelState, key: string): string {
  const existing = state.byKey.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const id = `AX${String(state.next++).padStart(3, "0")}`.slice(0, 7).padEnd(7, " ");
  state.byKey.set(key, id);
  return id;
}

function smpteTimecode(seconds: number, framerate: number, dropFrame: boolean): string {
  const totalFrames = secondsToFrames(seconds, framerate);
  const nominalFrameRate = Math.max(1, Math.round(framerate));
  const frameNumber = dropFrame ? toDropFrameNumber(totalFrames, nominalFrameRate) : totalFrames;
  const framesPerHour = nominalFrameRate * 60 * 60;
  const framesPerMinute = nominalFrameRate * 60;
  const hours = Math.floor(frameNumber / framesPerHour);
  const minutes = Math.floor((frameNumber % framesPerHour) / framesPerMinute);
  const frameRemainder = frameNumber % framesPerMinute;
  const secondsPart = Math.floor(frameRemainder / nominalFrameRate);
  const frames = frameRemainder % nominalFrameRate;
  const separator = dropFrame ? ";" : ":";

  return `${[hours, minutes, secondsPart].map((value) => String(value).padStart(2, "0")).join(":")}${separator}${String(frames).padStart(2, "0")}`;
}

function secondsToFrames(seconds: number, framerate: number): number {
  return Math.max(0, Math.round(seconds * framerate));
}

function usesDropFrameNumbering(framerate: number): boolean {
  const nominalFrameRate = Math.max(1, Math.round(framerate));
  const fractional = Math.abs(framerate - nominalFrameRate) > 0.001;
  return fractional && (nominalFrameRate === 30 || nominalFrameRate === 60);
}

function toDropFrameNumber(totalFrames: number, nominalFrameRate: number): number {
  const dropFrames = Math.round(nominalFrameRate * 0.066666);
  const framesPerHour = nominalFrameRate * 60 * 60;
  const framesPer24Hours = framesPerHour * 24;
  const framesPer10Minutes = nominalFrameRate * 60 * 10 - dropFrames * 9;
  const framesPerMinute = nominalFrameRate * 60 - dropFrames;
  let frameNumber = totalFrames % framesPer24Hours;
  if (frameNumber < 0) {
    frameNumber += framesPer24Hours;
  }

  const tenMinuteChunks = Math.floor(frameNumber / framesPer10Minutes);
  const remainingFrames = frameNumber % framesPer10Minutes;
  const droppedMinutes = Math.max(0, Math.floor((remainingFrames - dropFrames) / framesPerMinute));

  return frameNumber + dropFrames * (9 * tenMinuteChunks + droppedMinutes);
}

function sanitizeTitle(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").trim() || "predit export";
}

function edlReadme(projectName: string): string {
  return [
    `# ${projectName} CMX 3600 EDL`,
    "",
    "Import `timeline.edl` in your NLE's EDL import workflow.",
    "CMX 3600 is a lowest-common-denominator handoff: it preserves timing, reel IDs, and hard cuts, but it does not embed captions or retain full clip names.",
    "Use `captions/word_timings.json` beside this file when captions need to be rebuilt in the editor.",
    "",
  ].join("\n");
}
