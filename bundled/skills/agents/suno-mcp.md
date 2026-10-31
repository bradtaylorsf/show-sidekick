---
name: "suno-mcp"
description: "Generate a full song (vocals, lyrics, style, title) through Suno's official MCP server when the attached agent session has the Suno connector. Use for music-led episodes that need an original track before the cuesheet stage, and prefer it over browser automation of suno.com."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 0
---

# Suno MCP

## Show Sidekick Usage Contract

- Read this skill before calling any Suno MCP tool from an attached agent session.
- Route execution through the Show Sidekick workflow: the song lands in the project, then the normal cuesheet stage reads it. Do not wrap the MCP in ad-hoc scripts.
- Announce paid generation before running it. Every create spends the user's own Suno credits.
- Log provider/model decisions (`music_source`, `provider_selection`) in the decision log.

## When To Use

Use this skill when all of these hold:

1. The episode is audio-led (`master_clock: audio`, for example the `music-video` pipeline) and no track has been supplied yet (`music_library/` and the episode inputs are empty for this episode).
2. The agent running the stage can see Suno MCP tools in its tool list. The official server is `https://api.suno.com/mcp`. It is attached to the agent, not to the harness, so the registry cannot see it: check your own tool list.
3. The user has approved generation for this episode (the `music_source` decision, or a standing rule in the project's `AGENTS.md`).

If the tools are missing, fall back to the order in `meta/music-plan`: user tracks, `music_generation` tools in the registry, `music_search`, then ask.

## Model Identity

Suno's official MCP server (beta, launched October 2026). It signs in with the user's own Suno account (OAuth, no API key) and uses that account's plan and credits. Songs are saved to the user's Suno library. Advertised capabilities: create a song from a description or from exact lyrics + style + title, build a song from an uploaded voice memo or loop, cover, extend, mash up library songs, apply a saved Suno Voice, add to a playlist, and check the credit balance.

Suno has not published tool names or schemas. Discover them from your tool list at run time and map them to the steps below. Do not guess argument names: read the schema.

The separate Suno developer REST API (`platform.suno.com`) is a closed partner beta. The registry tool `suno_music` targets that API and stays unavailable until the user is admitted and sets `SUNO_API_KEY`.

## Prompt Structure

Build the create call from the episode's approved inputs, never from a fresh idea:

- **Lyrics**: the approved lyrics file verbatim, with Suno section tags (`[Verse]`, `[Chorus]`, `[Bridge]`). Suno's create form caps lyrics at 5,000 characters. Refuse rather than truncate.
- **Style**: the approved style prompt (genre, tempo, instruments, vocal type, production feel). Cap 1,000 characters. Refuse rather than truncate.
- **Title**: the episode title.
- Use the tool's exact-lyrics / custom mode when lyrics are supplied. Use description mode only for instrumental beds the user asked for.

## Parameter Defaults

- **One create per episode per run.** A create returns up to two takes. Do not retry on failure: stop and escalate.
- **Check credits first** with the balance tool, if one exists. If the balance cannot cover one create, stop with a blocker.
- **Record before you create.** Write `suno.json` next to the episode inputs with `status: "submitted"`, the title and a timestamp before the call, so a crash cannot cause a second spend. Update it with the returned song ids and status afterwards.
- **Getting the audio:**
  - If the tool returns a downloadable audio URL or file, save each take into the episode inputs as `suno-take-<n>.<ext>` (never overwrite; take the next free number) and record the source URL and song id in `suno.json`.
  - If it returns only library ids, set `suno.json` `status: "in_library"`, list the ids, and stop the stage `awaiting_human` with the message "Song is in your Suno library: download the take you want into <episode inputs>". Do not drive the suno.com website to download it.
- Then let the normal cuesheet stage pick up the track. Do not re-time or re-encode the song here.

## Quality Keywords

exact lyrics, section tags, tempo in BPM, lead vocal type, genre blend, production era, polished mix, clear diction.

## Anti-Patterns

- Calling create more than once per episode, or "trying again" after a failure or a weak take. The user picks between takes; you don't regenerate.
- Naming real artists or using copyrighted lyrics in the style or lyrics.
- Inventing lyrics or style during the build. Use only approved inputs.
- Publishing, sharing, or making a song public from the MCP. Playlist and publish-type tools are out of scope.
- Automating the suno.com website (Playwright, scraping) as a fallback. Stop and ask instead.
- Treating a take as cleared for commercial use. Rights depend on the user's Suno plan (Pro/Premier for commercial use) and are the user's call at review time.

## References

- Setup guide: `docs/suno-mcp.md` in the harness repo.
- `meta/music-plan` for source selection order, `meta/announce-and-escalate` for the blocker format.
