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
  | { mode: 'cli-login'; check: string }   // e.g. "higgsfield whoami"
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
| `cli` | `higgsfield`, `gh`, custom vendor CLIs | binary on PATH + auth check (e.g. `whoami` succeeds) |
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
    auth: { mode: 'cli-login', check: 'higgsfield whoami' },
    install: 'npm i -g @higgsfield/cli && higgsfield login',
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

## Selectors are methods, not tools

Routing across providers for a capability (TTS, image, video, music) is `registry.select(cap, prefs?)`. There is no `tts_selector` "tool" — the agent introspects providers via `registry.byCapability('tts')` and picks via `select()` or its own logic.

## Setup UX

- `predit setup <tool>` reads the tool's `integration.install` string and shells out to the tool's own login/install commands.
- `predit` never collects, stores, or transmits credentials. CLI tools own their own auth (e.g. `higgsfield login` keeps a token in the CLI's own config dir; API tools rely on env vars in the user's shell).
- The provider menu groups setup offers by 1-minute fixes (env var or `cli-login`), 5-minute installs, and complex setups (GPU, model downloads).

## Layer 3 vendor knowledge

Tool definitions stay terse. Provider-specific prompt engineering, parameter tuning, and quality techniques live in Markdown skills under `skills/agents/<name>.md`, referenced from `agent_skills`. The agent reads the vendor skill before calling the tool. Layer 3 is hand-editable without a TypeScript rebuild.
