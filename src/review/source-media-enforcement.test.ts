import { describe, expect, it } from "vitest";
import type { SourceMediaReview } from "../artifacts/source-media-review.js";
import { checkSourceMediaEnforcement } from "./source-media-enforcement.js";

describe("checkSourceMediaEnforcement", () => {
  it("requires source media review before proposal or script stages when user media exists", () => {
    const findings = checkSourceMediaEnforcement("proposal", {}, { userSuppliedMedia: [{ path: "media/interview.mp4" }] });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Source media review is required before planning from user media",
      }),
    );
  });

  it("flags empty technical probes", () => {
    const review = {
      files: [
        {
          path: "media/clip.mp4",
          reviewed: true,
          technical_probe: {},
          content_summary: "No probe fields cited.",
        },
      ],
    } as SourceMediaReview;

    const findings = checkSourceMediaEnforcement("script", {}, { sourceMediaReview: review });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Source media technical probe is empty",
        location: "source_media_review.files[0].technical_probe",
      }),
    );
  });

  it("flags content summaries that cite no probe field names", () => {
    const review: SourceMediaReview = {
      files: [
        {
          path: "media/clip.mp4",
          reviewed: true,
          technical_probe: { duration_seconds: 22, width: 1920 },
          content_summary: "A presenter walks through a product flow.",
        },
      ],
    };

    const findings = checkSourceMediaEnforcement("script", {}, { sourceMediaReview: review });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Source media summary is not grounded in probe fields",
      }),
    );
  });

  it("flags short clips that claim interview or dialogue content", () => {
    const review: SourceMediaReview = {
      files: [
        {
          path: "media/short.mov",
          reviewed: true,
          technical_probe: { duration_seconds: 8, width: 1280 },
          content_summary: "duration_seconds confirms this is an interview with dialogue.",
        },
      ],
    };

    const findings = checkSourceMediaEnforcement("script", {}, { sourceMediaReview: review });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Short source media interview claim needs investigation",
      }),
    );
  });
});
