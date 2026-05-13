import { describe, expect, it } from "vitest";
import videoDownloader, { parseDownloadedPath } from "./video-downloader.js";

describe("video_downloader", () => {
  it("registers the yt-dlp video download capability", () => {
    expect(videoDownloader.name).toBe("video_downloader");
    expect(videoDownloader.capability).toBe("video_download");
    expect(videoDownloader.integration).toMatchObject({ kind: "binary", binary: "yt-dlp" });
  });

  it("parses input defaults and output shape", () => {
    expect(
      videoDownloader.input.parse({
        url: "https://www.youtube.com/watch?v=fixture",
        output_dir: "/tmp/predit-downloads",
      }).format,
    ).toBe("mp4");

    expect(
      videoDownloader.output.parse({
        path: "/tmp/predit-downloads/fixture.mp4",
        source_url: "https://www.youtube.com/watch?v=fixture",
      }).path,
    ).toBe("/tmp/predit-downloads/fixture.mp4");
  });

  it("extracts the downloaded filepath from yt-dlp output", () => {
    expect(parseDownloadedPath("[download] 100%\n/tmp/predit-downloads/fixture.mp4\n")).toBe(
      "/tmp/predit-downloads/fixture.mp4",
    );
  });
});
