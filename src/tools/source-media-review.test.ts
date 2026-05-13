import { describe, expect, it } from "vitest";
import sourceMediaReview, {
  buildSourceMediaReviewFile,
  buildTechnicalProbe,
  parseFfprobeJson,
  planningImplicationsForProbe,
} from "./source-media-review.js";

describe("source_media_review", () => {
  it("registers the source media review capability", () => {
    expect(sourceMediaReview.name).toBe("source_media_review");
    expect(sourceMediaReview.capability).toBe("source_media_review");
    expect(sourceMediaReview.integration).toMatchObject({ kind: "binary", binary: "ffprobe" });
  });

  it("builds a reviewed artifact from ffprobe output and records video risks", () => {
    const ffprobe = parseFfprobeJson(
      JSON.stringify({
        streams: [
          { codec_type: "video", codec_name: "h264", width: 640, height: 360, r_frame_rate: "30/1" },
          { codec_type: "audio", codec_name: "aac", channels: 1, channel_layout: "mono", sample_rate: "48000" },
        ],
        format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "2.5" },
      }),
    );
    const file = buildSourceMediaReviewFile("fixture.mp4", ffprobe);

    expect(sourceMediaReview.output.parse({ files: [file] }).files[0]).toMatchObject({
      reviewed: true,
      planning_implications: ["Low resolution", "Mono audio", "Very short clip"],
    });
    expect(file.content_summary).toContain("duration_s");
    expect(file.content_summary).toContain("width");
  });

  it("records image-specific low resolution risks", () => {
    const probe = buildTechnicalProbe(
      {
        streams: [{ codec_type: "video", codec_name: "png", width: 320, height: 240, nb_frames: "1" }],
        format: { format_name: "image2" },
      },
      "still.png",
    );

    expect(planningImplicationsForProbe(probe)).toEqual(["Low resolution (image)"]);
  });
});
