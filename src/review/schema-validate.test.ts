import { describe, expect, it } from "vitest";
import { validateArtifactAgainstSchema } from "./schema-validate.js";

describe("validateArtifactAgainstSchema", () => {
  it("returns a critical finding for an invalid scene plan", () => {
    const findings = validateArtifactAgainstSchema("scene_plan", { scenes: [{}] });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      severity: "critical",
      location: "scene_plan.scenes[0].slug",
      status: "pending",
    });
    expect(findings[0]?.proposed_fix).toContain("scene_plan.scenes[0].slug");
  });

  it("returns a critical finding for an invalid deck manifest", () => {
    const findings = validateArtifactAgainstSchema("deck_manifest", {
      source: {
        kind: "pptx",
        file_type: "pptx",
        source_path: "/tmp/demo.pptx",
        sha256: "abc123",
        byte_size: 100,
      },
      slides: [
        {
          id: "slide-001",
          order: 1,
          image_path: "captures/slides/slide-001.png",
          image: { width: 1920, height: 1080 },
          text_source: "native",
          notes_source: "pptx_notes",
          source: { slide_number: 1 },
        },
        {
          id: "slide-001",
          order: 2,
          image_path: "captures/slides/slide-002.png",
          image: { width: 1920, height: 1080 },
          text_source: "native",
          notes_source: "pptx_notes",
          source: { slide_number: 2 },
        },
      ],
      extraction: {},
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      severity: "critical",
      location: "deck_manifest.slides",
      status: "pending",
    });
  });
});
