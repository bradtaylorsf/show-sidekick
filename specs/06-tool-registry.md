# 06 — Tool Registry

## Tool interface

Every tool implements the same `Tool` contract. Tools are pure TypeScript files in `src/tools/`. The registry globs the directory and registers each default export.

```ts
import { z } from 'zod';

export interface Tool<I = unknown, O = unknown> {
  name: string;                          // "higgsfield"
  capability: Capability;                // "image_to_video" | "tts" | "music_generation" | "music_search" | ...
  provider: string;                      // "higgsfield" | "elevenlabs" | "ffmpeg"
  status: 'production' | 'beta' | 'experimental';
  source?: 'bundled' | 'project';        // project tools come from projects/<show>/<episode>/tools/
  requires_first_call_approval?: boolean;// paid project API tools require first-call approval

  integration: Integration;

  best_for: string;
  supports?: string[];
  cost?: { unit: CostUnit; usd: number };
  agent_skills?: string[];               // → skills/agents/<name>.md

  input: z.ZodSchema<I>;
  output: z.ZodSchema<O>;

  isAvailable(): Promise<Availability>;
  execute(params: I, ctx: ToolContext): Promise<O>;
}

export type Integration =
  | { kind: 'cli';     binary: string; auth: CliAuth; install: string }
  | { kind: 'api';     env: string[];                  install: string }
  | { kind: 'binary';  binary: string;                 install: string }
  | { kind: 'library'; package: string;                install: string };

export type CliAuth =
  | { mode: 'cli-login'; check: string }   // e.g. "higgsfield account status --json"
  | { mode: 'env'; env: string[] }
  | { mode: 'none' };

export type Availability =
  | { available: true }
  | { available: false; reason: string; fix?: 'cli-login' | 'env' | 'install' | 'manual' };

export type CostUnit = 'clip' | 'second' | 'minute' | 'token' | 'image' | 'call';
```

## Integration kinds — first-class

The `Integration` discriminated union is the registry's first-class abstraction for "how does this tool get installed and authenticated."

| Kind | Examples | Availability check |
|---|---|---|
| `cli` | `higgsfield`, `gh`, custom vendor CLIs | binary on PATH + auth check (e.g. an account/status command succeeds) |
| `api` | ElevenLabs, OpenAI, Anthropic | required env vars present |
| `binary` | `ffmpeg`, `whisper.cpp`, `aubio`, `yt-dlp` | binary on PATH |
| `library` | pure Node libraries | `require.resolve` succeeds |

The agent-facing setup menu reads naturally because of this — "logged in as X" for CLI tools, "set VAR to unlock" for API tools, "install X via Homebrew" for binaries.

## Registry surface

```ts
export class Registry {
  async discover(): Promise<void>;       // glob src/tools/*.ts, register exports
  get(name: string): Tool | undefined;
  all(): Tool[];
  byCapability(cap: Capability): Tool[];
  byProvider(provider: string): Tool[];
  registerProjectTools(projectRoot, show, episode): Promise<Tool[]>;

  async select(
    cap: Capability,
    prefs?: { prefer?: string[]; runtime?: Integration['kind'] }
  ): Promise<Tool>;

  menuSummary(): CapabilityMenu;         // "X of Y configured" rollup
  setupOffers(): SetupOffer[];           // 1-min fixes grouped by env-var / cli-login
  warnings(): string[];                  // e.g. "node version < 22"
}
```

## Tool declaration pattern

One tool per file under `src/tools/`. Use the `defineTool` helper for clean typing.

```ts
// src/tools/higgsfield.ts
import { z } from 'zod';
import { defineTool, runCli } from '../registry';

export default defineTool({
  name: 'higgsfield',
  capability: 'image_to_video',
  provider: 'higgsfield',
  status: 'production',

  integration: {
    kind: 'cli',
    binary: 'higgsfield',
    auth: { mode: 'cli-login', check: 'higgsfield account status --json' },
    install: 'npm i -g @higgsfield/cli && higgsfield auth login',
  },

  best_for: 'kling v2.1 pro image-to-video, 5-sec hero clips, image animation',
  supports: ['image-to-video', 'kling-v2.1-pro'],
  cost: { unit: 'clip', usd: 0.30 },
  agent_skills: ['higgsfield-generate', 'ai-video-gen'],

  input: z.object({
    image_url: z.string().url(),
    prompt: z.string(),
    duration: z.number().default(5),
  }),
  output: z.object({ video_path: z.string(), cost_usd: z.number() }),

  async execute(params, ctx) {
    return runCli('higgsfield', ['generate', '--json'], { input: params, ctx });
  },
});
```

Compatibility aliases may ship as thin tool modules that spread a canonical tool, override `name`, and add `supports: ['compat-alias']`. Aliases exist only to keep older manifests and skills resolving through the registry; new manifests should use canonical tool names.

## Provider selection

Routing across providers for a capability (TTS, image, video, music, capture) is `registry.select(cap, prefs?)`. The agent introspects providers via `registry.byCapability('<capability>')` and picks via `select()` or its own logic.

Some capabilities also expose a `predit` provider-selection marker tool for discovery when no concrete provider is bundled yet, or when a manifest needs a stable capability entry. Marker tools use `supports: ['provider-selection']` and throw a clear error if executed directly. When concrete providers exist for the same capability, `registry.select()` ignores the marker and ranks only executable providers.

Runner preflight treats marker tools as presence-only entries. It may validate
that the marker is registered and that `isAvailable()` reports true, but it
must not call `execute({})` as a health probe. Direct execution is reserved for
concrete provider tools; markers exist to keep manifests declarative while the
agent or runner selects the real provider for the stage.

## Setup UX

- `predit setup <tool>` reads the tool's setup metadata and shells out to the tool's own login/install commands. For `cli-login` tools whose binary is already installed, setup may run the login refresh command directly instead of repeating the install step.
- `predit` never collects, stores, or transmits credentials. CLI tools own their own auth (e.g. `higgsfield auth login` keeps a token in the CLI's own config dir; API tools rely on env vars in the user's shell).
- The provider menu groups setup offers by 1-minute fixes (env var or `cli-login`), 5-minute installs, and complex setups (GPU, model downloads).

## Provider profiles

Provider profiles are named setup lanes that group concrete tools and preflight checks for repeatable demos. The first shipped profile is `paid-demo`: OpenAI image generation and OpenAI TTS fallback (`OPENAI_API_KEY`), ElevenLabs TTS (`ELEVENLABS_API_KEY`), Higgsfield image-to-video (`higgsfield` plus `higgsfield account status --json`), and local `ffmpeg` / `ffprobe`.

Selecting a provider profile for a run records a `provider_profile_selection` decision with rejected alternatives, so reviewers can distinguish an intentional paid-provider lane from the zero-key or mixed setup paths.

## Tool path policy

Tools that read user-supplied source media may accept absolute paths outside the project root, so users can inspect or ingest media from locations such as `~/Videos` or `/tmp`.
Relative read paths resolve against `projectRoot`.

Tools that write generated artifacts must keep output paths inside `projectRoot`.
When a tool needs an output directory for frames, recordings, downloads, or rendered media, it should resolve that path with the write-path helper and reject traversal outside the project.
If a tool stores a review artifact for a caller-supplied source path, it should preserve the caller's original path string in the artifact and use the resolved path only for probing.

## Project-scoped tools

`MET-11` capability extensions may add episode-local tools under `projects/<show>/<episode>/tools/<name>.ts` or `.js`.
The registry validates these modules against the same `Tool` contract, tags them `source: 'project'`, and skips `_draft` / test files.
Paid project API tools are tagged `requires_first_call_approval: true`; the tool execution path must fire the first-paid-call approval hook before the first paid API call and record a `capability_extension` decision.

## Layer 3 vendor knowledge

Tool definitions stay terse. Provider-specific prompt engineering, parameter tuning, and quality techniques live in Markdown skills under `skills/agents/<name>.md`, referenced from `agent_skills`. The agent reads the vendor skill before calling the tool. Layer 3 is hand-editable without a TypeScript rebuild.
