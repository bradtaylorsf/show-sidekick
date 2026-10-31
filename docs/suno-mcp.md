# Suno MCP

Suno's official MCP server (beta since October 2026) lets an agent create songs with your own Suno account. Show Sidekick does not call it directly: the harness never stores credentials, and MCP servers belong to the agent. Instead, the agent that runs your stages (`showkick build --agent ...`) gets the Suno connector, and the `suno-mcp` agent skill tells it how to make a track for an audio-led episode.

## What it is

| | |
|---|---|
| Server | `https://api.suno.com/mcp` (streamable HTTP) |
| Auth | Sign in to Suno in a browser and approve access. No API key. |
| Access | Early access: request it at suno.com/mcp ("Get early access"). |
| Plans | Works on every Suno plan, Free included. Songs spend the account's normal credits. |
| Rights | Free-plan songs are non-commercial. Commercial use needs a song made while on Pro or Premier. |
| Output | Songs are saved to your Suno library. Whether the tools also return a downloadable audio file is not documented yet. |

The Suno developer REST API (`platform.suno.com`) is a different product. It is a closed partner beta with an application queue. The `suno_music` registry tool targets that API and stays unavailable until you are admitted and set `SUNO_API_KEY`.

## Setup (Claude Code as the stage agent)

1. Get Suno MCP early access for your Suno account.
2. Add the server at user scope, so it is available in every project folder that `showkick` runs in:

   ```bash
   claude mcp add --scope user --transport http suno https://api.suno.com/mcp
   ```

3. Start `claude` once in a terminal, run `/mcp`, choose `suno`, and finish the Suno sign-in in the browser. The token is stored by Claude Code on that machine, so later headless runs reuse it.
4. Check it: in that same session, ask "list my Suno credits". You should see a Suno tool call succeed.
5. Run builds with the Suno tools allowed for the headless agent:

   ```bash
   showkick build <episode> \
     --agent 'claude -p --permission-mode acceptEdits --allowedTools "mcp__suno__*"' \
     --review-gate final
   ```

   Without `--allowedTools`, a headless run cannot answer the permission prompt and the Suno calls are refused.

## How a build uses it

During the stage that needs music (proposal / music plan in audio-led pipelines), the agent follows `meta/music-plan` and, when no track was supplied and the Suno tools are present, the `suno-mcp` skill:

1. Checks the credit balance.
2. Writes `suno.json` (`status: submitted`) before spending, so a crash never causes a second create.
3. Makes one create from the approved lyrics, style and title. No retries.
4. Saves returned takes as `suno-take-<n>.<ext>` in the episode inputs, or, if the tools return only library ids, stops `awaiting_human` and asks you to download the take you want.
5. Hands off to the normal cuesheet stage.

The skill never publishes, shares or makes songs public, and never falls back to automating the suno.com website.

## Unattended runs

The sign-in is a personal OAuth session on one machine. Suno has not documented service accounts, so nightly runs must happen on the machine where you completed step 3, and you redo `/mcp` sign-in when the token expires. A run that finds the Suno tools missing or unauthenticated falls back to the other sources in `meta/music-plan` rather than failing the build.
