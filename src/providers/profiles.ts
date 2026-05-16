import { DecisionEntrySchema, type DecisionEntry } from "../artifacts/decision-log.js";
import type { Integration } from "../registry/tool.js";
import { z } from "zod";

export type ProviderProfileSlug = "paid-demo";

export type ProviderProfileCheck = {
  id: string;
  label: string;
  description: string;
  integration: Integration;
  setup: string;
  tool_names: string[];
};

export type ProviderProfile = {
  slug: ProviderProfileSlug;
  display_name: string;
  description: string;
  required_tools: string[];
  checks: ProviderProfileCheck[];
  alternatives: Array<{
    label: string;
    rejected_because: string | null;
    notes?: string | null;
  }>;
};

export const PAID_DEMO_PROFILE: ProviderProfile = {
  slug: "paid-demo",
  display_name: "Paid Demo",
  description: "OpenAI GPT Image 2 stills, ElevenLabs TTS, OpenAI TTS fallback, Higgsfield image-to-video, and local ffmpeg assembly.",
  required_tools: ["higgsfield_image", "openai_image", "openai_tts", "elevenlabs_tts", "higgsfield", "ffmpeg"],
  checks: [
    {
      id: "openai-api-key",
      label: "OPENAI_API_KEY",
      description: "OpenAI GPT Image 2 stills and OpenAI TTS fallback",
      integration: {
        kind: "api",
        env: ["OPENAI_API_KEY"],
        install: "Set OPENAI_API_KEY to an OpenAI API key.",
      },
      setup: "Set OPENAI_API_KEY to an OpenAI API key.",
      tool_names: ["openai_image", "openai_tts"],
    },
    {
      id: "elevenlabs-api-key",
      label: "ELEVENLABS_API_KEY",
      description: "ElevenLabs premium narration",
      integration: {
        kind: "api",
        env: ["ELEVENLABS_API_KEY"],
        install: "Set ELEVENLABS_API_KEY to an ElevenLabs API key.",
      },
      setup: "Set ELEVENLABS_API_KEY to an ElevenLabs API key.",
      tool_names: ["elevenlabs_tts"],
    },
    {
      id: "higgsfield-binary",
      label: "higgsfield binary",
      description: "Higgsfield CLI installed on PATH",
      integration: {
        kind: "binary",
        binary: "higgsfield",
        install: "npm i -g @higgsfield/cli && higgsfield auth login",
      },
      setup: "Install the Higgsfield CLI with `npm i -g @higgsfield/cli`, then run `higgsfield auth login`.",
      tool_names: ["higgsfield", "higgsfield_image"],
    },
    {
      id: "higgsfield-account-status",
      label: "higgsfield account status",
      description: "Higgsfield CLI login",
      integration: {
        kind: "cli",
        binary: "higgsfield",
        auth: { mode: "cli-login", check: "higgsfield account status --json" },
        install: "npm i -g @higgsfield/cli && higgsfield auth login",
      },
      setup: "Run `higgsfield auth login`, then verify with `higgsfield account status --json`.",
      tool_names: ["higgsfield", "higgsfield_image"],
    },
    {
      id: "ffmpeg-binary",
      label: "ffmpeg",
      description: "Local ffmpeg assembly",
      integration: {
        kind: "binary",
        binary: "ffmpeg",
        install: "macOS: brew install ffmpeg\nLinux: sudo apt-get update && sudo apt-get install ffmpeg\nWindows: winget install Gyan.FFmpeg",
      },
      setup: "Install ffmpeg (`brew install ffmpeg` on macOS).",
      tool_names: ["ffmpeg"],
    },
    {
      id: "ffprobe-binary",
      label: "ffprobe",
      description: "Local ffprobe media probing",
      integration: {
        kind: "binary",
        binary: "ffprobe",
        install: "macOS: brew install ffmpeg\nLinux: sudo apt-get update && sudo apt-get install ffmpeg\nWindows: winget install Gyan.FFmpeg",
      },
      setup: "Install ffmpeg, which includes ffprobe (`brew install ffmpeg` on macOS).",
      tool_names: ["source_media_review"],
    },
  ],
  alternatives: [
    {
      label: "paid-demo",
      rejected_because: null,
      notes: "Selected profile: OpenAI GPT Image 2 stills, ElevenLabs narration, OpenAI TTS fallback, Higgsfield clips, and ffmpeg assembly.",
    },
    {
      label: "free-zero-cost",
      rejected_because: "Does not exercise paid provider-backed demo generation.",
      notes: "Useful for starter smoke tests but not for provider validation.",
    },
    {
      label: "mixed",
      rejected_because: "Leaves provider coverage ambiguous for the paid demo lane.",
      notes: "Can be useful for production, but this demo profile needs deterministic provider requirements.",
    },
    {
      label: "kling_video",
      rejected_because: "Higgsfield is the first paid demo path and wraps the target Kling clip lane.",
      notes: null,
    },
    {
      label: "runway_video",
      rejected_because: "Higher variance for this benchmark and not part of the first paid profile.",
      notes: null,
    },
    {
      label: "piper_tts",
      rejected_because: "Zero-cost local TTS does not validate paid narration setup.",
      notes: null,
    },
    {
      label: "google_tts",
      rejected_because: "Not part of the first paid demo profile.",
      notes: null,
    },
  ],
};

const PROFILES = new Map<ProviderProfileSlug, ProviderProfile>([[PAID_DEMO_PROFILE.slug, PAID_DEMO_PROFILE]]);

export function getProviderProfile(slug: string): ProviderProfile | undefined {
  return PROFILES.get(slug as ProviderProfileSlug);
}

export function providerProfileNames(): ProviderProfileSlug[] {
  return [...PROFILES.keys()];
}

export const ProviderProfileNameSchema = z.string().refine(
  (value): value is ProviderProfileSlug => PROFILES.has(value as ProviderProfileSlug),
  {
    message: `expected one of: ${providerProfileNames().join(", ")}`,
  },
);

export function buildProviderProfileDecision(input: {
  profile: ProviderProfile;
  timestamp: string;
  stage?: string;
}): DecisionEntry {
  return DecisionEntrySchema.parse({
    id: `provider-profile-${input.profile.slug}-${input.timestamp.replace(/[^0-9A-Z]/gu, "")}`,
    stage: input.stage ?? "preflight",
    timestamp: input.timestamp,
    category: "provider_profile_selection",
    scope: {
      provider: input.profile.slug,
    },
    options_considered: input.profile.alternatives,
    picked: input.profile.slug,
    reason: `${input.profile.display_name} selected for a provider-backed paid demo lane.`,
    confidence: 0.85,
    user_visible: true,
    supersedes: null,
  });
}
