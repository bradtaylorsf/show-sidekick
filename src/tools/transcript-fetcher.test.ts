import { describe, expect, it } from "vitest";
import transcriptFetcher, { languageFromVttPath, parseVttCaptions, parseVttTimestamp } from "./transcript-fetcher.js";

describe("transcript_fetcher", () => {
  it("registers the transcript fetch capability", () => {
    expect(transcriptFetcher.name).toBe("transcript_fetcher");
    expect(transcriptFetcher.capability).toBe("transcript_fetch");
    expect(transcriptFetcher.integration).toMatchObject({ kind: "binary", binary: "yt-dlp" });
  });

  it("parses VTT timestamps", () => {
    expect(parseVttTimestamp("01:02:03.500")).toBe(3723.5);
    expect(parseVttTimestamp("02:03.250")).toBe(123.25);
  });

  it("parses VTT captions into the output schema", () => {
    const captions = parseVttCaptions(`WEBVTT

1
00:00:01.000 --> 00:00:03.500 align:start
<c>Hello</c> &amp; welcome

00:00:04.000 --> 00:00:05.000
Second line
`);

    expect(
      transcriptFetcher.output.parse({
        captions,
        source_lang: "en",
        source_url: "https://example.com/watch?v=fixture",
      }),
    ).toEqual({
      captions: [
        { start_s: 1, end_s: 3.5, text: "Hello & welcome" },
        { start_s: 4, end_s: 5, text: "Second line" },
      ],
      source_lang: "en",
      source_url: "https://example.com/watch?v=fixture",
    });
  });

  it("infers caption language from VTT filenames", () => {
    expect(languageFromVttPath("/tmp/abc.en.vtt", "fallback")).toBe("en");
    expect(languageFromVttPath("/tmp/abc.vtt", "fallback")).toBe("fallback");
  });
});
