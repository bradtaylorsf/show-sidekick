#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const positionalArgs = args.filter((arg) => arg !== "--force" && arg !== "--dry-run");
const sourceArg = positionalArgs[0];

if (!sourceArg) {
  console.error("Usage: node scripts/port-agent-skills.mjs [--dry-run] [--force] <reference-repo-root>");
  process.exit(1);
}

const sourceRoot = path.resolve(repoRoot, sourceArg);
const sourceBrand = process.env.PREDIT_REFERENCE_BRAND ?? ["Open", "Montage"].join("");
const agentsTargetDir = path.join(repoRoot, "bundled", "skills", "agents");
const resourceDirectories = ["assets", "examples", "references", "rules", "scripts", "templates"];
const rootResourceFiles = ["AGENTS.md", "README.md", "PROVENANCE.md", "data-in-motion.md", "house-style.md", "patterns.md", "reference.md", "visual-styles.md"];
const copiedResourceSkips = new Set([".DS_Store", "SKILL.md"]);

try {
  await stat(sourceRoot);
} catch {
  console.error(`Reference repo root not found: ${sourceRoot}`);
  process.exit(1);
}

const criticalSkills = new Set([
  "flux-best-practices",
  "seedance-2-0",
  "ai-video-gen",
  "elevenlabs",
  "google-tts",
  "music",
  "higgsfield-generate",
  "remotion",
  "gsap-timeline",
  "gsap-plugins",
  "acestep",
  "whisperx",
]);

const skillCopies = [
  { name: "bfl-api", issue: 72 },
  { name: "flux-best-practices", issue: 72 },
  { name: "grok-media", issue: 72 },
  { name: "ai-video-gen", issue: 73 },
  { name: "seedance-2-0", issue: 73 },
  { name: "ltx2", issue: 73 },
  { name: "elevenlabs", issue: 74 },
  { name: "music", issue: 74 },
  { name: "acestep", issue: 74 },
  { name: "text-to-speech", issue: 74 },
  { name: "doubao-tts", issue: 74 },
  { name: "sound-effects", issue: 74 },
  { name: "setup-api-key", issue: 74 },
  { name: "avatar-video", issue: 75 },
  { name: "heygen", issue: 75 },
  { name: "create-video", issue: 75 },
  { name: "faceswap", issue: 75 },
  { name: "video-translate", issue: 75 },
  { name: "agents", issue: 75 },
  { name: "speech-to-text", issue: 75 },
  { name: "playwright-recording", issue: 76 },
  { name: "ffmpeg", issue: 76 },
  { name: "video-edit", issue: 76 },
  { name: "video-download", issue: 76 },
  { name: "video-understand", issue: 76 },
  { name: "video_toolkit", issue: 76 },
  { name: "beautiful-mermaid", issue: 77 },
  { name: "d3-viz", issue: 77 },
  { name: "manim-composer", issue: 77 },
  { name: "manimce-best-practices", issue: 77 },
  { name: "manimgl-best-practices", issue: 77 },
  { name: "visual-style", issue: 77 },
  { name: "gsap-core", issue: 78 },
  { name: "gsap-timeline", issue: 78 },
  { name: "gsap-plugins", issue: 78 },
  { name: "gsap-react", issue: 78 },
  { name: "gsap-utils", issue: 78 },
  { name: "gsap-performance", issue: 78 },
  { name: "gsap-scrolltrigger", issue: 78 },
  { name: "gsap-frameworks", issue: 78 },
  { name: "framer-motion", issue: 78 },
  { name: "lottie-bodymovin", issue: 78 },
  { name: "character-rigging", issue: 79 },
  { name: "svg-character-animation", issue: 79 },
  { name: "pose-library-design", issue: 79 },
  { name: "canvas-procedural-animation", issue: 79 },
  { name: "character-animation-qa", issue: 79 },
  { name: "remotion", issue: 80 },
  { name: "remotion-best-practices", issue: 80 },
  { name: "synthetic-screen-recording", issue: 80 },
  { name: "hyperframes", issue: 80 },
  { name: "hyperframes-cli", issue: 80 },
  { name: "hyperframes-registry", issue: 80 },
  { name: "website-to-hyperframes", issue: 80 },
  { name: "higgsfield-generate", issue: 81 },
  { name: "threejs-animation", issue: 81 },
  { name: "threejs-fundamentals", issue: 81 },
  { name: "threejs-geometry", issue: 81 },
  { name: "threejs-interaction", issue: 81 },
  { name: "threejs-lighting", issue: 81 },
  { name: "threejs-loaders", issue: 81 },
  { name: "threejs-materials", issue: 81 },
  { name: "threejs-postprocessing", issue: 81 },
  { name: "threejs-shaders", issue: 81 },
  { name: "threejs-textures", issue: 81 },
  { name: "tailwind-design-system", issue: 81 },
  { name: "web-design-guidelines", issue: 81 },
  { name: "vercel-react-best-practices", issue: 81 },
  { name: "vercel-composition-patterns", issue: 81 },
  { name: "whisperx", issue: 71, sourceFile: "skills/core/whisperx.md" },
];

const syntheticSkills = [
  googleTtsSkill(),
  videoProviderNotes("kling", {
    title: "Kling Video Provider Notes",
    description: "Kling model-selection, prompt-shape, and parameter guidance for predit video generation.",
    modelIdentity:
      "Kling 3.0 and Kling 2.6 are Kling video models available through fal.ai and Higgsfield-style gateways. Kling is a lower-cost alternative to Seedance 2.0 for single-plane scenes, anime/stylized clips, motion transfer, and image-to-video anchored by a first frame.",
    promptStructure:
      "Use the shared video prompt grammar: subject, motion, scene, camera, style, timing. For Kling 2.6 use the original four-part structure from the source prompt guide and the `++emphasis++` syntax only for the highest-priority element.",
    parameterDefaults:
      "`aspect_ratio`: `16:9`, `9:16`, or `1:1`; `duration`: 3-15 seconds for Kling 3.0; `mode`: `pro` for hero quality, `std` only for cheaper iterations; media roles: `start_image` and optionally `end_image`.",
    qualityKeywords:
      "cinematic motion, advanced physics, clear subject action, explicit camera motion, coherent first-frame anchoring, natural subject movement.",
    antiPatterns:
      "Do not choose Kling only because Seedance validation is harder. Avoid long multi-shot choreography when Seedance 2.0 is available and budget allows it. Do not pass unsupported reference roles; validate with the model schema first.",
  }),
  videoProviderNotes("runway", {
    title: "Runway Video Provider Notes",
    description: "Runway Gen-4 and Runway-hosted Seedance routing notes for predit video generation.",
    modelIdentity:
      "Runway Gen-4 is a premium video-generation surface. Runway can also expose Seedance 2.0 for enterprise/non-US accounts through a provider model parameter.",
    promptStructure:
      "Focus on motion, not appearance. Keep one scene per clip, name the camera move, action, and style in direct language, and keep the prompt compact enough that the model can execute the movement cleanly.",
    parameterDefaults:
      "Use Runway only when the configured tool/provider supports the requested model. For Seedance through Runway, pass `model=\"seedance_2.0\"` through the registry provider surface. Keep clip specs to the model's current accepted duration, aspect, and media-role schema.",
    qualityKeywords:
      "focused motion, simple shot, photoreal, cinematic, controlled camera, clean action, stable subject.",
    antiPatterns:
      "Do not pack multiple unrelated scenes into a single Runway clip. Do not use Runway as a silent substitute after a Seedance decision without logging the provider change and getting approval.",
  }),
  videoProviderNotes("veo", {
    title: "Veo Video Provider Notes",
    description: "Google Veo prompt and parameter guidance for predit video generation.",
    modelIdentity:
      "Google Veo 3.1, Veo 3.1 Lite, Veo 3, and Veo 2 are Google video models exposed through provider gateways. Veo is strongest for photoreal landscape, cinematic realism, and batch/volume work when using Lite.",
    promptStructure:
      "Use one direct paragraph with subject, action, setting, camera movement, lighting, and style. For Veo, keep instructions specific and avoid competing camera directions.",
    parameterDefaults:
      "`aspect_ratio`: `16:9` or `9:16` for Veo 3.1; `duration`: `4`, `6`, or `8`; `quality`: `basic`, `high`, or `ultra`; media role: one `start_image` for Veo 3.1 or one `image` for Veo 3.",
    qualityKeywords:
      "ultra-realistic, cinematic, natural motion, grounded physics, detailed lighting, coherent camera, realistic ambience.",
    antiPatterns:
      "Do not submit unsupported aspect ratios or long durations. Do not route to Veo just because it is familiar if Seedance 2.0 better matches multi-shot, lip-sync, or native synced-audio requirements.",
    extraSource: "skills/creative/prompting/veo-prompting.md",
  }),
  videoProviderNotes("minimax", {
    title: "MiniMax Video Provider Notes",
    description: "MiniMax/Hailuo selection and prompt guidance for predit video generation.",
    modelIdentity:
      "MiniMax Hailuo is a budget-friendly video model with strong natural-physics motion. Use it when the user wants cheaper motion and audio is not required.",
    promptStructure:
      "Write a concise physical-action prompt: subject, environment, camera, and one clear motion arc. Emphasize observable forces and natural timing.",
    parameterDefaults:
      "Use the provider schema discovered by the registry or model endpoint. Treat no-audio as the default expectation, and verify aspect ratio, duration, and media roles before submission.",
    qualityKeywords:
      "natural physics, grounded motion, clear action, smooth camera, coherent subject, practical lighting.",
    antiPatterns:
      "Do not use MiniMax for native synced audio, lip-sync, or complex multi-shot story beats. Do not downgrade to MiniMax unless budget, speed, or physics fit is the explicit reason.",
  }),
  higgsfieldSyntheticSkill("higgsfield-soul-id", {
    title: "Higgsfield Soul ID",
    description: "Use Soul Character references and Soul-family Higgsfield models for identity-consistent characters.",
    sections: [
      "Use this when a production needs the same face or persona across images, cinematic stills, or follow-on video references.",
      "Source model catalog guidance: Soul 2.0 is for aesthetic UGC, fashion editorial, and character generation; Soul Cinema is for cinematic stills; Soul Cast is text-only for distinctive personas; Soul Location is prompt-only for places.",
      "When a Soul Character reference id already exists, pass it to Soul-aware models with `--soul-id <soul_ref_id>` and prefer `text2image_soul_v2` for stills or Soul Cinema for cinematic frames.",
      "Do not invent a training command. Discover the current Higgsfield CLI surface first, then use the existing `higgsfield-generate` skill and model schema to validate the exact job set and flags before submitting.",
    ],
  }),
  higgsfieldSyntheticSkill("higgsfield-character-train", {
    title: "Higgsfield Character Training",
    description: "Prepare and validate identity-training or character-reference workflows for Higgsfield.",
    sections: [
      "Use this when the user asks to train, register, or reuse a character identity before generation.",
      "Collect a rights-cleared reference set with consistent identity, clean lighting, and enough variation in expression and angle. Avoid celebrities, copyrighted characters, or ambiguous consent.",
      "Inspect the live Higgsfield CLI/model schema before submitting. The source skill explicitly routes generic generation away from character training and toward a dedicated Soul/identity flow, so the agent must validate the current command surface rather than guessing.",
      "After a reference id is created, switch to `higgsfield-soul-id` or `higgsfield-generate` for production prompts and log the identity reference used.",
    ],
  }),
  higgsfieldSyntheticSkill("higgsfield-product-photoshoot", {
    title: "Higgsfield Product Photoshoot",
    description: "Generate brand/product visuals, hero banners, lifestyle shots, and virtual try-on style imagery through Higgsfield-oriented defaults.",
    sections: [
      "Use this instead of generic `higgsfield-generate` for brand product visuals, Pinterest pins, lifestyle product scenes, hero banners, ad packs, virtual try-on, restyles, or product-focused marketing images.",
      "Source model catalog guidance routes these visuals through a product-photoshoot prompt enhancer on top of GPT Image 2. Keep brand/product identity, label text, dimensions, material, and camera framing explicit.",
      "For Marketing Studio product entities, first import or create the product with `higgsfield marketing-studio products fetch --url ... --wait` or `higgsfield marketing-studio products create --title ... --image ...`.",
      "Do not send a bare product photo to a generic image model when a product entity, brand kit, or product-specific workflow is available.",
    ],
  }),
  higgsfieldSyntheticSkill("higgsfield-listing-image", {
    title: "Higgsfield Listing Image",
    description: "Create marketplace/listing-ready product images with clear offer, product, and brand constraints.",
    sections: [
      "Use this for marketplace listing cards, ecommerce thumbnails, App Store or web-product visuals, and direct-response product image variants.",
      "Choose a product entity or webproduct first. App Store URLs auto-route to webproducts; normal ecommerce URLs use `higgsfield marketing-studio products fetch --url ... --wait`.",
      "Keep prompt structure tight: product identity, target marketplace context, angle, background, claims or text, aspect ratio, and any required brand kit.",
      "Do not overload listing images with too many text claims; prioritize product legibility, recognizable brand elements, and a single visual promise.",
    ],
  }),
  higgsfieldSyntheticSkill("marketing-studio", {
    title: "Marketing Studio",
    description: "Higgsfield Marketing Studio video/image ad workflow for avatars, products, hooks, settings, ad references, and brand kits.",
    sections: [
      "Use Marketing Studio for all advertising and commercial video: UGC, unboxing, product showcase, product review, TV spot, virtual try-on, DTC ad images, brand/product workflows, and click-to-ad from product URLs.",
      "Core entities: avatar, product/webproduct, hook, setting, ad reference, brand kit, and ad format. Browse existing entities before creating new ones.",
      "Default video mode is `ugc`; other source modes include `ugc_how_to`, `ugc_unboxing`, `product_showcase`, `product_review`, `tv_spot`, `wild_card`, `ugc_virtual_try_on`, and `virtual_try_on`.",
      "Hook/setting setup items are valid only for the UGC-family modes listed in the source references. For DTC ads, picking an ad format is mandatory; there is no auto-default.",
      "Read the mirrored references under `higgsfield-generate/references/marketing-*.md` before executing a Marketing Studio job.",
    ],
  }),
];

const criticalGuidance = {
  "flux-best-practices": {
    modelIdentity:
      "BFL FLUX.2 and FLUX.1 image models. Prefer FLUX.2 `pro`, `max`, or `flex` for production image generation, typography, and style-sensitive work; use FLUX.1 Fill/Kontext only when that older family is the explicit tool surface.",
    promptStructure:
      "`[Subject] + [Action/Pose] + [Style/Medium] + [Context/Setting] + [Lighting] + [Camera/Technical]`. Quote rendered text and state colors with names plus `#RRGGBB` hex values when brand accuracy matters.",
    parameterDefaults:
      "Do not send negative prompts. Pick the model by task: `max` for quality, `pro` for balanced production, `flex` for text/typography, Fill for inpainting. Keep aspect ratio and reference-image roles aligned with the selected tool schema.",
    qualityKeywords:
      "specific subject, natural language, precise lighting, lens/camera detail, material texture, brand colors, quoted typography.",
    antiPatterns:
      "Negative prompts, vague style words, unquoted visible text, missing lighting, conflicting colors, and treating FLUX.1 Kontext as the default when FLUX.2 is available.",
  },
  "seedance-2-0": {
    modelIdentity:
      "ByteDance Seedance 2.0, the premium default for cinematic, trailer, teaser, and motion-led clips when a configured gateway is available.",
    promptStructure:
      "Open with a shot-structure declaration, then write environment, character identity, beat-by-beat choreography with timestamps, camera behavior, VFX or slow-motion markers, and sound design.",
    parameterDefaults:
      "Use `standard` before `fast` for first production attempts. Use 4-15 seconds, provider-supported aspect ratios, and reference media roles up to images/video/audio only when the gateway schema supports them.",
    qualityKeywords:
      "multi-shot, cinematic lighting, 35mm film, ARRI ALEXA aesthetic, photorealistic, heavy film grain, motion blur, halation, sharp but imperfect focus.",
    antiPatterns:
      "Do not route complex camera, lip-sync, native-audio, or multi-shot work to cheaper models without an explicit reason. Do not omit camera negations like `no cuts` or `no zoom` for POV shots.",
  },
  "ai-video-gen": {
    modelIdentity:
      "Capability-level video generation across Seedance, VEO, Kling, Sora, Runway, MiniMax, LTX, HeyGen, fal.ai, Replicate, and Higgsfield-style gateways.",
    promptStructure:
      "Choose provider first, then produce a model-specific prompt with subject, action, scene, camera, style, duration, aspect, reference media, and audio/lip-sync requirements.",
    parameterDefaults:
      "Prefer Seedance 2.0 for cinematic/motion-led work when configured. Use LTX for budget/speed, Veo for explicit Google/photoreal preference, and Kling/MiniMax only when their fit is documented.",
    qualityKeywords:
      "clear camera move, visible subject action, coherent scene, model-appropriate duration, consistent identity, explicit audio intent.",
    antiPatterns:
      "Silent provider swaps, choosing a provider before checking capabilities, packing unrelated scenes into one clip, or using a generic prompt across all models.",
  },
  elevenlabs: {
    modelIdentity:
      "ElevenLabs text-to-speech, voice cloning, sound effects, and music APIs. For TTS, use `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_turbo_v2_5`, or `eleven_v3` intentionally.",
    promptStructure:
      "For voice, write clean narration/dialogue with pronunciation hints and pause strategy. For sound effects/music, use direct descriptive prompts with genre, mood, instrumentation, tempo, or acoustic detail.",
    parameterDefaults:
      "Natural/professional voice: stability `0.75-0.85`, similarity `0.9`, style `0.0-0.1`, speed `1.0`. Use flash/turbo for SSML breaks and multilingual_v2 for reliability.",
    qualityKeywords:
      "natural pacing, clear pronunciation, section pauses, consistent voice ID, clean samples, specific sound source, genre/mood/instruments/tempo.",
    antiPatterns:
      "Using ellipses as pause control, assuming SSML works on every model, cloning from noisy samples, or fighting pauses in TTS when FFmpeg silence insertion is more reliable.",
  },
  "google-tts": {
    modelIdentity:
      "Google Cloud Text-to-Speech with Standard, WaveNet, Neural2, Studio, Journey, and Chirp 3 HD voices. Default to `en-US-Chirp3-HD-Orus` when no voice is specified.",
    promptStructure:
      "Provide plain narration text or SSML, voice name, language code, speaking rate, pitch, audio encoding, and output path. Use explicit language codes for localization.",
    parameterDefaults:
      "`language_code`: `en-US`; `voice`: `en-US-Chirp3-HD-Orus`; `speaking_rate`: `1.0`; `pitch`: `0.0`; `audio_encoding`: `MP3`. Chirp/Journey voices use the beta endpoint.",
    qualityKeywords:
      "localized, SSML-controlled, clear diction, natural pacing, Chirp 3 HD, Neural2, WaveNet, consistent language code.",
    antiPatterns:
      "Missing `GOOGLE_API_KEY`/`GOOGLE_APPLICATION_CREDENTIALS`, mismatched voice and language code, unsupported encoding, excessive speaking-rate changes, or using Google TTS for voice cloning.",
  },
  music: {
    modelIdentity:
      "Capability-level music generation across ElevenLabs Music (`music_gen`), Suno (`suno_music`), ACE-Step/MusicGen-style open generation (`acestep`), and stock/library fallbacks.",
    promptStructure:
      "State genre, mood, instruments, tempo, production feel, and use case. For songs, separate lyrics/sections from the style prompt.",
    parameterDefaults:
      "Use explicit duration. For ElevenLabs `music_gen`, set `duration_seconds` and `force_instrumental`; for Suno, choose `model` from `V4`, `V4_5`, `V5`, set `instrumental`, and use `custom_mode` only when exact lyrics/style/title are provided.",
    qualityKeywords:
      "genre, mood, instruments, tempo, cinematic, instrumental, build, climax, loopable, polished production.",
    antiPatterns:
      "Referencing specific artists or copyrighted lyrics, using vague prompts like `cool music`, omitting duration, or adding vocals when the scene needs bed music.",
  },
  "higgsfield-generate": {
    modelIdentity:
      "Higgsfield CLI generation across GPT Image 2, Seedance 2.0, Nano Banana 2/Pro, Marketing Studio, Soul models, Kling 3.0, Veo, Minimax, and Virality Predictor.",
    promptStructure:
      "Pick the model by task, pass media files directly to role flags, validate params with `higgsfield model get`, then submit once with `higgsfield generate create ... --wait`.",
    parameterDefaults:
      "Default image/design/text to GPT Image 2, serious video to Seedance 2.0, character/reference image work to Nano Banana 2/Pro, ads/product demos to Marketing Studio, and video analysis to `brain_activity`.",
    qualityKeywords:
      "sensory detail, camera/lens, lighting, model-specific media roles, brand/product context, identity consistency, attention score, virality hook.",
    antiPatterns:
      "Inventing model names, downgrading from Seedance 2.0 for schema convenience, exposing raw IDs/JSON dumps, or routing video analysis as text generation.",
  },
  remotion: {
    modelIdentity:
      "Remotion composition runtime for deterministic React/TypeScript video rendering, reusable components, frame-based animation, captions, audio, and NLE handoff assets.",
    promptStructure:
      "Translate the scene plan into component props, frame timings, transitions, audio cues, captions, and render settings. Keep motion frame-based and reproducible.",
    parameterDefaults:
      "Use 30fps unless the project overrides it. Use `staticFile`, `OffthreadVideo`, `delayRender` for async assets, clamped interpolation, and constant playback rates.",
    qualityKeywords:
      "deterministic, frame-accurate, clamped interpolation, audio-synced, caption-safe, reusable component, render-verified.",
    antiPatterns:
      "CSS transitions during render, unclamped interpolation, variable playbackRate without preprocessing, missing delayRender, or runtime swaps without approval.",
  },
  "gsap-timeline": {
    modelIdentity:
      "GSAP `gsap.timeline()` sequencing for coordinated tweens, labels, nesting, playback, and Remotion/HyperFrames-compatible animation choreography.",
    promptStructure:
      "Define the animation beats, then sequence tweens with timeline defaults, labels, and position parameters. Use `'<', '>', '+=', '-=', label` placement rather than ad-hoc delays.",
    parameterDefaults:
      "Use timeline `defaults` for shared `duration`/`ease`, labels for readable sections, and ScrollTrigger only at the top-level timeline/tween.",
    qualityKeywords:
      "sequenced, labeled, defaults, position parameter, nested timeline, deterministic choreography, readable beats.",
    antiPatterns:
      "Chaining many delays, forgetting defaults, putting ScrollTrigger on nested child tweens, or assuming timeline constructor `duration` controls child duration.",
  },
  "gsap-plugins": {
    modelIdentity:
      "GSAP plugin guidance for SplitText, MorphSVG, MotionPath, DrawSVG, Flip, CustomEase, EasePack, CustomWiggle, and related paid/free plugins.",
    promptStructure:
      "Map the motion requirement to the narrow plugin: text splitting, path morphing, path following, stroke drawing, layout transition, or bespoke easing.",
    parameterDefaults:
      "Register plugins before use, check license/install availability, and keep plugin work inside deterministic render-safe lifecycle hooks for React/Remotion/HyperFrames.",
    qualityKeywords:
      "SplitText, MorphSVG, MotionPath, DrawSVG, Flip, CustomEase, deterministic setup, license checked, measured layout.",
    antiPatterns:
      "Using plugin APIs without registration, relying on unavailable paid plugins, mutating layout mid-render without FLIP measurement, or hand-rolling complex path animation when a plugin exists.",
  },
  acestep: {
    modelIdentity:
      "ACE-Step 1.5 open-source music generation for background music, vocal tracks, covers, style transfer, and stem extraction.",
    promptStructure:
      "For captions, layer genre/style, emotion, instruments, timbre, era, production, and vocal type. For lyrics, use section tags and natural syllable counts.",
    parameterDefaults:
      "Use `--duration`, optional `--bpm`, `--key`, presets for video scenes, `--seed` for iteration, `--cover-strength` for cover tasks, and explicit stem names for extraction.",
    qualityKeywords:
      "specific genre, mood, instruments, BPM, key, studio-polished, cinematic, section tags, seed-locked iteration.",
    antiPatterns:
      "Vague captions, contradictory styles, melody descriptions in caption instead of sound/feeling, lyrics with unnatural syllable counts, or missing RunPod endpoint configuration.",
  },
  whisperx: {
    modelIdentity:
      "WhisperX/faster-whisper transcription with word timestamps, language detection, VAD, optional alignment, and pyannote diarization.",
    promptStructure:
      "Provide source audio/video, model size, language or auto-detect, diarization choice, and expected transcript/caption output needs.",
    parameterDefaults:
      "Default `base` for speed and `large-v3` for production. Enable diarization only for multi-speaker material and only when `HF_TOKEN`/pyannote support is available.",
    qualityKeywords:
      "word-level timestamps, VAD, language detection, diarization, speaker labels, confidence, spot-check segments, subtitle alignment.",
    antiPatterns:
      "Using diarization for a single speaker, accepting large transcript gaps, ignoring timestamp drift, or using tiny/base for final production without spot-checking quality.",
  },
};

const missing = [];
const conflicts = [];
const wouldWrite = [];
let copied = 0;
let synthesized = 0;

if (!dryRun) {
  await mkdir(agentsTargetDir, { recursive: true });
}

for (const copy of skillCopies) {
  const result = await resolveSource(copy);
  if (result === undefined) {
    missing.push(copy.name);
    continue;
  }

  const { sourcePath, sourceDir, markdown } = result;
  const sourceFrontmatter = readFrontmatter(markdown);
  const description =
    typeof sourceFrontmatter.description === "string"
      ? normalizeRepoTerms(normalizeWhitespace(sourceFrontmatter.description))
      : `Layer 3 agent skill for ${copy.name}.`;
  const body = stripFrontmatter(markdown);
  const resourceDir = path.join(agentsTargetDir, copy.name);

  if (sourceDir !== undefined) {
    await copyResources(sourceDir, resourceDir, copy.name);
  } else if (!dryRun) {
    await rm(resourceDir, { recursive: true, force: true });
  }

  const content = composeAgentSkill({
    name: copy.name,
    description,
    issue: copy.issue,
    body: rewriteFlattenedSkillLinks(normalizeRepoTerms(body), copy.name, sourceDir),
    critical: criticalSkills.has(copy.name),
    sourcePath,
  });

  if (await writeOutput(path.join(agentsTargetDir, `${copy.name}.md`), content)) {
    copied += 1;
  }
}

for (const synthetic of syntheticSkills) {
  const target = path.join(agentsTargetDir, `${synthetic.name}.md`);
  if (await writeOutput(
    target,
    composeAgentSkill({
      name: synthetic.name,
      description: synthetic.description,
      issue: synthetic.issue,
      body: normalizeRepoTerms(synthetic.body),
      critical: criticalSkills.has(synthetic.name),
      sourcePath: synthetic.sourcePath,
    }),
  )) {
    synthesized += 1;
  }
}

console.log(`Copied ${copied} agent skills from ${sourceRoot}.`);
console.log(`Synthesized ${synthesized} companion agent skills from source notes and tool metadata.`);
if (dryRun && wouldWrite.length > 0) {
  console.log("Dry run would write:");
  wouldWrite.forEach((entry) => console.log(`- ${entry}`));
}
if (missing.length > 0) {
  console.log("Missing source skills:");
  missing.forEach((entry) => console.log(`- ${entry}`));
  process.exitCode = 1;
}
if (conflicts.length > 0) {
  console.log("Refusing to overwrite edited files without --force:");
  conflicts.forEach((entry) => console.log(`- ${entry}`));
  process.exitCode = 1;
}

async function resolveSource(copy) {
  if (copy.sourceFile !== undefined) {
    const sourcePath = path.join(sourceRoot, copy.sourceFile);
    try {
      return { sourcePath, markdown: await readFile(sourcePath, "utf8") };
    } catch {
      return undefined;
    }
  }

  for (const root of [".agents/skills", ".claude/skills"]) {
    const sourceDir = path.join(sourceRoot, root, copy.name);
    const sourcePath = path.join(sourceDir, "SKILL.md");
    try {
      return { sourcePath, sourceDir, markdown: await readFile(sourcePath, "utf8") };
    } catch {
      // Try the next root.
    }
  }

  return undefined;
}

function composeAgentSkill({ name, description, issue, body, critical, sourcePath }) {
  const frontmatter = {
    name,
    description,
    applies_to: "agents",
    agent_skill: true,
    critical,
    epic: 8,
    issue,
  };

  const normalizedBody = normalizeHeading(name, body.trim());
  const sections = [
    formatFrontmatter(frontmatter),
    preditContract(name, critical, sourcePath),
    supplementalNotes(name),
    normalizedBody,
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

function supplementalNotes(name) {
  if (name !== "music") {
    return "";
  }

  return `## predit Music Provider Notes

The original music skill body below focuses on ElevenLabs Music. In predit, the \`music\` Layer 3 skill also covers the provider selector shape that routes across generated music providers:

| Provider/tool | Best for | Key parameters |
|---|---|---|
| \`music_gen\` / ElevenLabs | Background music and sound effects matched to video duration | \`prompt\`, required \`duration_seconds\` (3-600), \`force_instrumental: true\`, \`output_path\` |
| \`suno_music\` / Suno | Full songs, vocals, custom lyrics, instrumentals, longer tracks | \`prompt\`, \`style\`, \`title\`, \`instrumental: true\`, \`custom_mode: false\`, \`model: V4\`, \`track_index: 0\` |
| \`acestep\` | Open music generation, covers/style transfer, stem extraction | \`prompt\`, \`duration\`, optional \`bpm\`, \`key\`, presets, lyrics, cover/reference, or extract target |

Do not let a generator silently default duration. Derive music length from the approved script, cuesheet, or target scene runtime. For songs with lyrics, keep lyrics/structure separate from production style and verify that the provider supports vocals before submitting.`;
}

function preditContract(name, critical, sourcePath) {
  const crossRefs = ["`bundled/templates/user-project/AGENTS.md`", "`specs/06-tool-registry.md`", "`specs/08-skills.md`"];
  const lines = [
    "## predit Usage Contract",
    "",
    "- Read this skill before calling any tool that lists it in `agent_skills`.",
    "- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.",
    "- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.",
    `- Keep this skill aligned with ${crossRefs.join(", ")}.`,
  ];

  if (sourcePath !== undefined) {
    lines.push("- The source body below is normalized for predit paths and terminology while preserving the original operational details.");
  }

  if (critical) {
    lines.push("", ...criticalContract(name));
  }

  return lines.join("\n");
}

function criticalContract(name) {
  const contract = criticalGuidance[name] ?? {
    modelIdentity: "Use the concrete provider/model identity named by the tool registry and source skill before generating.",
    promptStructure: "Convert the stage brief into subject, action, context, style, and output constraints before calling the tool.",
    parameterDefaults: "Use the tool schema defaults unless this skill names a better production default for the brief.",
    qualityKeywords: "Specific, grounded, production-ready, coherent, style-consistent.",
    antiPatterns: "Do not use vague prompts, silent provider swaps, unsupported parameters, or unlogged model changes.",
  };

  return [
    "## Model Identity",
    "",
    contract.modelIdentity,
    "",
    "## Prompt Structure",
    "",
    contract.promptStructure,
    "",
    "## Parameter Defaults",
    "",
    contract.parameterDefaults,
    "",
    "## Quality Keywords",
    "",
    contract.qualityKeywords,
    "",
    "## Anti-Patterns",
    "",
    contract.antiPatterns,
  ];
}

async function copyResources(sourceDir, targetDir, skillName) {
  if (!dryRun) {
    if (force) {
      await rm(targetDir, { recursive: true, force: true });
    }
    await mkdir(targetDir, { recursive: true });
  }

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    if (copiedResourceSkips.has(entry.name)) {
      continue;
    }

    await copyResourceEntry(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), entry, skillName, 0);
  }
}

async function copyResourceEntry(sourcePath, targetPath, entry, skillName, depth) {
  if (entry.isDirectory()) {
    if (entry.name === "node_modules" || entry.name === "__pycache__" || entry.name.startsWith(".")) {
      return;
    }

    if (!dryRun) {
      await mkdir(targetPath, { recursive: true });
    }
    for (const child of await readdir(sourcePath, { withFileTypes: true })) {
      if (copiedResourceSkips.has(child.name)) {
        continue;
      }
      await copyResourceEntry(path.join(sourcePath, child.name), path.join(targetPath, child.name), child, skillName, depth + 1);
    }
    return;
  }

  if (!entry.isFile()) {
    return;
  }

  if (!dryRun) {
    await mkdir(path.dirname(targetPath), { recursive: true });
  }
  if (isTextPath(sourcePath)) {
    const normalized = normalizeResourceSkillLinks(normalizeRepoTerms(await readFile(sourcePath, "utf8")), skillName, depth);
    await writeOutput(targetPath, normalized);
  } else {
    await copyFileOutput(sourcePath, targetPath);
  }
}

function normalizeResourceSkillLinks(value, skillName, depth) {
  const flatSkillPath = `${"../".repeat(depth + 1)}${skillName}.md`;
  return value
    .replace(/\]\((?:\.\.\/)*SKILL\.md(#[^)]+)?\)/gu, `](${flatSkillPath}$1)`)
    .replace(/\bsee SKILL\.md\b/giu, `see ${skillName}.md`)
    .replace(/\bbecause SKILL\.md\b/giu, `because ${skillName}.md`);
}

function isTextPath(filePath) {
  return /\.(css|csv|html|js|json|jsx|md|mjs|py|sh|svg|toml|ts|tsx|txt|yaml|yml)$/iu.test(filePath);
}

function rewriteFlattenedSkillLinks(body, name, sourceDir) {
  if (sourceDir === undefined) {
    return body;
  }

  let rewritten = body;
  for (const dir of resourceDirectories) {
    rewritten = rewritten.replace(new RegExp(`(?<![A-Za-z0-9_.-]/)${escapeRegExp(dir)}/`, "gu"), `${name}/${dir}/`);
  }

  for (const file of rootResourceFiles) {
    rewritten = rewritten.replace(new RegExp(`(?<![A-Za-z0-9_.-]/)${escapeRegExp(file)}`, "gu"), `${name}/${file}`);
  }

  return rewritten;
}

function normalizeHeading(name, body) {
  if (/^#\s+/mu.test(body)) {
    return body;
  }

  return `# ${titleize(name)}\n\n${body}`;
}

function readFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return {};
  }

  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    return {};
  }

  try {
    return parseYaml(markdown.slice(4, end)) ?? {};
  } catch {
    return {};
  }
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }

  const end = markdown.indexOf("\n---\n", 4);
  return end === -1 ? markdown : markdown.slice(end + "\n---\n".length);
}

function formatFrontmatter(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      value.forEach((item) => lines.push(`  - ${quoteYaml(item)}`));
    } else {
      lines.push(`${key}: ${quoteYaml(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function quoteYaml(value) {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(String(value));
}

async function writeOutput(targetPath, content) {
  const normalizedContent = content.endsWith("\n") ? content : `${content}\n`;
  const relativePath = path.relative(repoRoot, targetPath);
  let isEdited = false;

  try {
    const existing = await readFile(targetPath, "utf8");
    isEdited = existing !== normalizedContent;
  } catch {
    // New files are safe to create without --force.
  }

  if (isEdited && !force) {
    conflicts.push(relativePath);
    if (!dryRun) {
      return false;
    }
  }

  if (dryRun) {
    wouldWrite.push(relativePath);
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, normalizedContent, "utf8");
  return true;
}

async function copyFileOutput(sourcePath, targetPath) {
  const relativePath = path.relative(repoRoot, targetPath);
  let isEdited = false;

  try {
    const [existing, next] = await Promise.all([readFile(targetPath), readFile(sourcePath)]);
    isEdited = !existing.equals(next);
  } catch {
    // New files are safe to create without --force.
  }

  if (isEdited && !force) {
    conflicts.push(relativePath);
    if (!dryRun) {
      return false;
    }
  }

  if (dryRun) {
    wouldWrite.push(relativePath);
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return true;
}

function normalizeRepoTerms(value) {
  return value
    .replaceAll(sourceBrand, "predit")
    .replaceAll(sourceBrand.toLowerCase(), "predit")
    .replaceAll(".claude/skills/", ".predit/skills/agents/")
    .replaceAll(".agents/skills/", ".predit/skills/agents/")
    .replaceAll("skills/creative/", "bundled/skills/creative/")
    .replaceAll("creative/prompting/", "bundled/skills/creative/prompting/")
    .replace(/(?<!\.predit\/)skills\/agents\//gu, ".predit/skills/agents/")
    .replaceAll(".predit/.predit/", ".predit/")
    .replace(
      /Vendored into predit from C:[\\/]+Users[\\/]+[^\\/]+[\\/]+Documents[\\/]hyperframes[\\/]skills[\\/]([^\n]+)/gu,
      "Adapted for predit from the HyperFrames skill package ($1)",
    )
    .replace(/C:[\\/]+Users[\\/]+[^\\/]+[\\/]+Documents[\\/]hyperframes[\\/]skills[\\/]/gu, "hyperframes-skills/")
    .replace(/C:[\\/]+Users[\\/]+[^\\/]+[\\/]+Documents[\\/]hyperframes/gu, "<hyperframes-clone>")
    .replace(/C:[\\/]+Users[\\/]+[^\\/]+[\\/]+Documents[\\/]predit/gu, "<predit-repo>")
    .replaceAll("\\SKILL.md", "/SKILL.md")
    .replace(/([A-Za-z0-9_-]+)\/SKILL\.md/gu, "$1.md")
    .replaceAll(".predit/skills/agents/remotion-official/", ".predit/skills/agents/remotion-best-practices/")
    .replaceAll("tools.tool_registry", "predit registry")
    .replaceAll("tools.analysis.composition_validator", "src/tools/composition-validator")
    .replaceAll("tools.analysis.audio_probe", "ffprobe or the audio metadata returned by predit audio tools")
    .replaceAll("tools.audio.tts_selector", "the predit registry TTS selector")
    .replaceAll("tools.audio.doubao_tts", "src/tools/doubao_tts")
    .replaceAll("tools/", "src/tools/")
    .replaceAll("lib/components", "src/remotion/components")
    .replaceAll("lib/transitions", "src/remotion/transitions")
    .replaceAll("remotion-composer/", "src/remotion/")
    .replaceAll("pipeline_defs/", "bundled/pipelines/")
    .replace(/\.predit\/skills\/agents\/([A-Za-z0-9_-]+)\/SKILL\.md/gu, ".predit/skills/agents/$1.md")
    .replace(/\.predit\/skills\/agents\/([A-Za-z0-9_-]+)\/SKILL/gu, ".predit/skills/agents/$1")
    .replace(/([`"'])skills\/agents\/([A-Za-z0-9_-]+)\.md/gu, "$1.predit/skills/agents/$2.md");
}

function googleTtsSkill() {
  return {
    name: "google-tts",
    issue: 74,
    description:
      "Google Cloud Text-to-Speech provider guidance for voice selection, SSML, localization, and output parameters.",
    sourcePath: "tools/audio/google_tts.py",
    body: `# Google TTS

Google Cloud Text-to-Speech offers 700+ voices across 50+ languages, including Standard, WaveNet, Neural2, Studio, Journey, and Chirp 3 HD voices. Use it for localization, affordable production narration, and SSML-controlled delivery when voice cloning is not required.

## Setup

- Set \`GOOGLE_API_KEY\` to a Google Cloud API key with Text-to-Speech enabled.
- Alternatively set \`GOOGLE_APPLICATION_CREDENTIALS\` for service-account auth.
- Enable the API in Google Cloud: \`texttospeech.googleapis.com\`.

## Tool Contract

The source provider exposed these inputs:

| Parameter | Default | Notes |
|---|---|---|
| \`text\` | required | Plain text or SSML input. |
| \`voice\` | \`en-US-Chirp3-HD-Orus\` | Rich/cinematic male default. Other examples: \`en-US-Chirp3-HD-Aoede\`, \`en-US-Studio-O\`, \`en-US-Neural2-D\`, \`en-US-Journey-D\`. |
| \`language_code\` | \`en-US\` | BCP-47 language code such as \`es-ES\`, \`ja-JP\`, \`fr-FR\`. |
| \`speaking_rate\` | \`1.0\` | Range \`0.25\` to \`4.0\`. |
| \`pitch\` | \`0.0\` | Semitone adjustment, range \`-20.0\` to \`20.0\`. |
| \`audio_encoding\` | \`MP3\` | One of \`MP3\`, \`LINEAR16\`, \`OGG_OPUS\`, \`MULAW\`, \`ALAW\`. |
| \`output_path\` | generated | Writes the audio artifact. |

## Voice Selection

- Chirp 3 HD and Journey voices require the beta API endpoint.
- Neural2 and WaveNet are strong affordable defaults for multilingual narration.
- Studio voices are higher cost and should be selected only when their quality difference matters.
- Google TTS is not a voice-cloning system; choose ElevenLabs when cloning or identity-specific voice matching is required.

## Prompting And SSML

- Use SSML for deterministic pauses, emphasis, pronunciation, and pacing where supported.
- Keep narration text clean; pronunciation hacks should be intentional and documented in the stage notes.
- Match \`voice\` and \`language_code\`; do not run a Spanish script through an English voice unless the accent is intentional.

## Cost Notes

The source tool estimated per-character costs by voice family:

- Chirp 3 HD: about $30 per 1M characters.
- Studio: about $160 per 1M characters.
- Neural2/Journey/WaveNet: about $16 per 1M characters.
- Standard: about $4 per 1M characters.
`,
  };
}

function videoProviderNotes(name, options) {
  const sourceAppendix =
    options.extraSource === undefined
      ? ""
      : `\n## Source Appendix\n\nRead the mirrored source prompt note when available: \`${options.extraSource.replace("skills/creative/", "bundled/skills/creative/")}\`.\n`;

  return {
    name,
    issue: 73,
    description: options.description,
    body: `# ${options.title}

Use this companion skill when the video-generation selector or provider tool routes to ${options.title.replace(" Provider Notes", "")}. It is distilled from the original video-generation and Higgsfield model-selection notes and should be read alongside \`ai-video-gen\`.

## Model Identity

${options.modelIdentity}

## Prompt Structure

${options.promptStructure}

## Parameter Defaults

${options.parameterDefaults}

## Quality Keywords

${options.qualityKeywords}

## Anti-Patterns

${options.antiPatterns}

## predit Routing

- Prefer \`ai-video-gen\` for capability-level provider selection.
- Prefer \`seedance-2-0\` when the brief requires premium multi-shot motion, native audio, or lip-sync and a configured gateway exists.
- Record provider and model changes in the decision log when they materially affect quality, cost, duration, or output format.
${sourceAppendix}`,
  };
}

function higgsfieldSyntheticSkill(name, options) {
  return {
    name,
    issue: 81,
    description: options.description,
    body: `# ${options.title}

This companion skill is distilled from the mirrored Higgsfield generation skill and its reference material. Read it alongside \`higgsfield-generate\`; that full skill remains the source for CLI bootstrap, model discovery, media roles, waiting, result delivery, and troubleshooting.

## Workflow

${options.sections.map((section) => `- ${section}`).join("\n")}

## Required Cross-Reads

- \`bundled/skills/agents/higgsfield-generate.md\`
- \`bundled/skills/agents/higgsfield-generate/references/model-catalog.md\`
- \`bundled/skills/agents/higgsfield-generate/references/media-inputs.md\`
- \`bundled/skills/agents/higgsfield-generate/references/prompt-engineering.md\`
`,
  };
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function titleize(slug) {
  return slug
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
