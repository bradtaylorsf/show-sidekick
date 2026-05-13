import { describe, expect, it } from "vitest";
import faceTracker, { parseFaceTrackerJson } from "./face-tracker.js";

describe("face_tracker", () => {
  it("registers the face tracking capability", () => {
    expect(faceTracker.name).toBe("face_tracker");
    expect(faceTracker.capability).toBe("face_tracking");
    expect(faceTracker.integration).toMatchObject({ kind: "binary", binary: "python3" });
  });

  it("parses the python tracker JSON payload", () => {
    const parsed = parseFaceTrackerJson(
      JSON.stringify({
        frames: [
          {
            time_s: 1.25,
            faces: [{ x: 10, y: 20, w: 40, h: 50, score: 1 }],
          },
        ],
      }),
    );

    expect(faceTracker.output.parse(parsed)).toEqual({
      frames: [
        {
          time_s: 1.25,
          faces: [{ x: 10, y: 20, w: 40, h: 50, score: 1 }],
        },
      ],
    });
  });
});
