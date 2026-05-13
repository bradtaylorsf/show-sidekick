import { describe, expect, it } from "vitest";
import { CheckpointSchema } from "../checkpoints/index.js";
import { ActionTimelineSchema } from "./action-timeline.js";
import { CharacterDesignSchema } from "./character-design.js";
import { CharacterQaReportSchema } from "./character-qa-report.js";
import { PoseLibrarySchema } from "./pose-library.js";
import { RigPlanSchema } from "./rig-plan.js";

describe("character animation artifact schemas", () => {
  it("accepts a multi-character action timeline", () => {
    const timeline = ActionTimelineSchema.parse({
      host: [
        { time_s: 0, pose: "idle", transition_frames: 0, ease: "linear" },
        { time_s: 1.5, pose: "point", transition_frames: 8, ease: "ease_out" },
      ],
      guest: [{ time_s: 0.5, pose: "nod", transition_frames: 4, ease: "ease_in_out" }],
    });

    expect(timeline.host).toHaveLength(2);
  });

  it("rejects negative action timeline times", () => {
    expect(() =>
      ActionTimelineSchema.parse({
        host: [{ time_s: -1, pose: "idle", transition_frames: 0, ease: "linear" }],
      }),
    ).toThrow("Number must be greater than or equal to 0");
  });

  it("accepts a minimal character design", () => {
    const design = CharacterDesignSchema.parse({
      slug: "host",
      visual_description: "A sharp presenter with a red jacket.",
    });

    expect(design.required_actions).toEqual([]);
  });

  it("rejects unknown character QA severities", () => {
    expect(() =>
      CharacterQaReportSchema.parse({
        findings: [
          {
            character: "host",
            aspect: "anatomy",
            severity: "blocker",
            description: "Arm proportions are wrong.",
          },
        ],
        summary: {
          characters_reviewed: 1,
          critical: 1,
          suggestions: 0,
        },
      }),
    ).toThrow("Invalid enum value");
  });

  it("accepts pose libraries with integer hold_frames", () => {
    const library = PoseLibrarySchema.parse({
      poses: {
        idle: {
          description: "Neutral standing pose",
          hold_frames: 30,
          transition_to: {
            point: {
              transition_frames: 8,
              ease: "ease_out",
            },
          },
        },
      },
      expressions: {
        smile: {
          description: "Small smile",
          joints: {
            mouth_left: { y: -2 },
          },
        },
      },
    });

    expect(library.poses.idle?.hold_frames).toBe(30);
  });

  it("rejects fractional and negative hold_frames", () => {
    const baseLibrary = {
      poses: {
        idle: {
          description: "Neutral standing pose",
          hold_frames: 30,
        },
      },
      expressions: {},
    };

    expect(() =>
      PoseLibrarySchema.parse({
        ...baseLibrary,
        poses: {
          idle: {
            description: "Neutral standing pose",
            hold_frames: 1.5,
          },
        },
      }),
    ).toThrow("Expected integer");

    expect(() =>
      PoseLibrarySchema.parse({
        ...baseLibrary,
        poses: {
          idle: {
            description: "Neutral standing pose",
            hold_frames: -1,
          },
        },
      }),
    ).toThrow("Number must be greater than or equal to 0");
  });

  it("accepts pose transition_to maps keyed by target pose name", () => {
    const library = PoseLibrarySchema.parse({
      poses: {
        idle: {
          description: "Neutral",
          hold_frames: 0,
          transition_to: {
            wave: { transition_frames: 12, ease: "ease_in_out" },
          },
        },
        wave: {
          description: "Wave",
          hold_frames: 10,
        },
      },
      expressions: {},
    });

    expect(library.poses.idle?.transition_to.wave?.transition_frames).toBe(12);
  });

  it("rejects rig plans with no joints", () => {
    expect(() =>
      RigPlanSchema.parse({
        character: "host",
        joints: [],
      }),
    ).toThrow("Array must contain at least 1 element(s)");
  });

  it("accepts a rig plan fixture", () => {
    const rig = RigPlanSchema.parse({
      character: "host",
      joints: [
        {
          id: "root",
          parent: null,
          pivot: { x: 0, y: 0 },
          default_rotation_deg: 0,
          range_deg: { min: -10, max: 10 },
        },
      ],
      attachment_points: [{ id: "mic", joint: "root", offset: { x: 10, y: 5 } }],
    });

    expect(rig.attachment_points).toHaveLength(1);
  });

  it("rejects checkpoints with unknown statuses", () => {
    expect(() =>
      CheckpointSchema.parse({
        stage: "scene_plan",
        status: "paused",
        timestamp: "2026-05-12T15:42:00Z",
        artifact: null,
      }),
    ).toThrow("Invalid enum value");
  });

  it("accepts a minimal checkpoint", () => {
    const checkpoint = CheckpointSchema.parse({
      stage: "assets",
      status: "in_progress",
      timestamp: "2026-05-12T15:42:00Z",
      artifact: null,
    });

    expect(checkpoint.tool_invocations).toEqual([]);
  });

  it("accepts a full checkpoint with style playbook and skills audit fields", () => {
    const checkpoint = CheckpointSchema.parse({
      stage: "scene_plan",
      status: "completed",
      timestamp: "2026-05-12T15:42:00Z",
      artifact: { scenes: [] },
      review_summary: {
        decision: "pass",
        rounds: 1,
        critical: 0,
        suggestions: 2,
        nitpicks: 1,
        findings: [{ title: "Shot variety" }],
      },
      cost_snapshot: {
        stage_cost_usd: 0.42,
        total_so_far_usd: 1.18,
        budget_remaining_usd: 3.82,
      },
      tool_invocations: [
        {
          tool: "image_generation",
          provider: "openai",
          model: "image-model",
          seed: 42,
          units: 1,
          usd: 0.12,
        },
      ],
      style_playbook: { slug: "clean-professional" },
      skills_read: ["pipelines/music-video/scene-director.md"],
    });

    expect(checkpoint.skills_read).toEqual(["pipelines/music-video/scene-director.md"]);
  });
});
