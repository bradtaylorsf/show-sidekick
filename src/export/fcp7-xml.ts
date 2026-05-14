import path from "node:path";
import type { AssetManifest, Cuesheet, EditDecisions, RenderReport } from "../artifacts/index.js";

export type LinkedTimelineAsset = AssetManifest["assets"][number] & {
  linked_path: string;
};

export type LinkedAudioTrack = {
  id: string;
  name: string;
  linked_path: string;
  duration_s: number;
  sample_rate?: number;
  channels?: number;
};

export type BuildFcp7XmlOptions = {
  projectName: string;
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  renderReport: RenderReport;
  assets: LinkedTimelineAsset[];
  audioTracks: LinkedAudioTrack[];
};

type Rate = {
  timebase: number;
  ntsc: boolean;
};

type FileState = {
  ids: Map<string, string>;
  emitted: Set<string>;
  next: number;
};

export function buildFcp7Xml(options: BuildFcp7XmlOptions): string {
  const cuts = [...options.editDecisions.cuts].sort((left, right) => left.start_s - right.start_s || left.end_s - right.end_s);
  if (cuts.length === 0) {
    throw new Error("cannot export FCP7 XML because edit_decisions.cuts is empty");
  }

  const rate = rateFromFramerate(options.renderReport.framerate);
  const sequenceDurationFrames = secondsToFrames(options.renderReport.duration_s, options.renderReport.framerate);
  const assetsById = new Map(options.assets.map((asset) => [asset.id, asset]));
  const fileState: FileState = { ids: new Map(), emitted: new Set(), next: 1 };

  const videoClips = cuts.map((cut, index) => {
    const asset = assetsById.get(cut.asset_id);
    if (asset === undefined) {
      throw new Error(`asset_manifest does not contain cut asset '${cut.asset_id}'`);
    }

    const start = secondsToFrames(cut.start_s, options.renderReport.framerate);
    const end = secondsToFrames(cut.end_s, options.renderReport.framerate);
    const duration = Math.max(0, end - start);

    return clipItemXml({
      id: `clipitem-${index + 1}`,
      name: assetName(asset.linked_path, asset.id),
      start,
      end,
      inFrame: 0,
      outFrame: duration,
      fileXml: videoFileXml(fileState, asset.linked_path, duration, rate, options.renderReport),
      sourcetrack: undefined,
    });
  });

  let nextAudioClipIndex = 1;
  const audioTracks = options.audioTracks.map((track) => {
    const duration = secondsToFrames(track.duration_s, options.renderReport.framerate);
    const clip = clipItemXml({
      id: `audio-clipitem-${nextAudioClipIndex++}`,
      name: track.name,
      start: 0,
      end: duration,
      inFrame: 0,
      outFrame: duration,
      fileXml: audioFileXml(fileState, track, duration, rate),
      sourcetrack: { mediaType: "audio", trackIndex: 1 },
    });

    return lines(["<track>", indent(clip, 2), "</track>"]);
  });

  const audioXml =
    audioTracks.length > 0
      ? lines([
          "<audio>",
          "  <numOutputChannels>2</numOutputChannels>",
          "  <format>",
          "    <samplecharacteristics>",
          "      <depth>16</depth>",
          "      <samplerate>48000</samplerate>",
          "    </samplecharacteristics>",
          "  </format>",
          ...audioTracks.map((track) => indent(track, 2)),
          "</audio>",
        ])
      : "<audio>\n  <numOutputChannels>2</numOutputChannels>\n</audio>";

  return `${lines([
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE xmeml>",
    '<xmeml version="5">',
    '  <sequence id="sequence-1">',
    `    <name>${xmlEscape(options.projectName)}</name>`,
    `    <duration>${sequenceDurationFrames}</duration>`,
    indent(rateXml(rate), 4),
    "    <timecode>",
    indent(rateXml(rate), 6),
    "      <string>00:00:00:00</string>",
    "      <frame>0</frame>",
    "      <displayformat>NDF</displayformat>",
    "    </timecode>",
    "    <media>",
    "      <video>",
    "        <format>",
    "          <samplecharacteristics>",
    indent(rateXml(rate), 12),
    `            <width>${options.renderReport.resolution.width}</width>`,
    `            <height>${options.renderReport.resolution.height}</height>`,
    "          </samplecharacteristics>",
    "        </format>",
    "        <track>",
    ...videoClips.map((clip) => indent(clip, 10)),
    "        </track>",
    "      </video>",
    indent(audioXml, 6),
    "    </media>",
    "  </sequence>",
    "</xmeml>",
  ])}\n`;
}

function clipItemXml(options: {
  id: string;
  name: string;
  start: number;
  end: number;
  inFrame: number;
  outFrame: number;
  fileXml: string;
  sourcetrack?: { mediaType: "audio" | "video"; trackIndex: number };
}): string {
  return lines([
    `<clipitem id="${xmlEscape(options.id)}">`,
    `  <name>${xmlEscape(options.name)}</name>`,
    "  <enabled>TRUE</enabled>",
    `  <start>${options.start}</start>`,
    `  <end>${options.end}</end>`,
    `  <in>${options.inFrame}</in>`,
    `  <out>${options.outFrame}</out>`,
    indent(options.fileXml, 2),
    ...(options.sourcetrack
      ? [
          "  <sourcetrack>",
          `    <mediatype>${options.sourcetrack.mediaType}</mediatype>`,
          `    <trackindex>${options.sourcetrack.trackIndex}</trackindex>`,
          "  </sourcetrack>",
        ]
      : []),
    "</clipitem>",
  ]);
}

function videoFileXml(
  state: FileState,
  filePath: string,
  duration: number,
  rate: Rate,
  renderReport: RenderReport,
): string {
  const fileId = fileIdFor(state, filePath);
  if (state.emitted.has(fileId)) {
    return `<file id="${fileId}"/>`;
  }
  state.emitted.add(fileId);

  return lines([
    `<file id="${fileId}">`,
    `  <name>${xmlEscape(assetName(filePath, fileId))}</name>`,
    `  <pathurl>${xmlEscape(filePathToPathUrl(filePath))}</pathurl>`,
    indent(rateXml(rate), 2),
    `  <duration>${duration}</duration>`,
    "  <media>",
    "    <video>",
    "      <samplecharacteristics>",
    indent(rateXml(rate), 8),
    `        <width>${renderReport.resolution.width}</width>`,
    `        <height>${renderReport.resolution.height}</height>`,
    "      </samplecharacteristics>",
    "    </video>",
    "  </media>",
    "</file>",
  ]);
}

function audioFileXml(state: FileState, track: LinkedAudioTrack, duration: number, rate: Rate): string {
  const fileId = fileIdFor(state, track.linked_path);
  if (state.emitted.has(fileId)) {
    return `<file id="${fileId}"/>`;
  }
  state.emitted.add(fileId);

  return lines([
    `<file id="${fileId}">`,
    `  <name>${xmlEscape(track.name)}</name>`,
    `  <pathurl>${xmlEscape(filePathToPathUrl(track.linked_path))}</pathurl>`,
    indent(rateXml(rate), 2),
    `  <duration>${duration}</duration>`,
    "  <media>",
    "    <audio>",
    "      <samplecharacteristics>",
    "        <depth>16</depth>",
    `        <samplerate>${Math.round(track.sample_rate ?? 48000)}</samplerate>`,
    `        <channelcount>${Math.max(1, Math.round(track.channels ?? 2))}</channelcount>`,
    "      </samplecharacteristics>",
    "    </audio>",
    "  </media>",
    "</file>",
  ]);
}

function fileIdFor(state: FileState, filePath: string): string {
  const existing = state.ids.get(filePath);
  if (existing !== undefined) {
    return existing;
  }

  const id = `file-${state.next++}`;
  state.ids.set(filePath, id);
  return id;
}

function rateXml(rate: Rate): string {
  return lines(["<rate>", `  <timebase>${rate.timebase}</timebase>`, `  <ntsc>${rate.ntsc ? "TRUE" : "FALSE"}</ntsc>`, "</rate>"]);
}

function rateFromFramerate(framerate: number): Rate {
  const rounded = Math.max(1, Math.round(framerate));

  return {
    timebase: rounded,
    ntsc: Math.abs(framerate - rounded) > 0.001,
  };
}

function secondsToFrames(seconds: number, framerate: number): number {
  return Math.max(0, Math.round(seconds * framerate));
}

function assetName(filePath: string, fallback: string): string {
  const base = path.basename(filePath);
  return base || fallback;
}

function filePathToPathUrl(filePath: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(filePath)) {
    return filePath;
  }

  const absolutePath = path.resolve(filePath);
  const encoded = absolutePath.split(path.sep).map(encodeURIComponent).join("/");
  const normalized = encoded.startsWith("/") ? encoded : `/${encoded}`;

  return `file://localhost${normalized}`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}

function lines(values: string[]): string {
  return values.join("\n");
}
