import { describe, expect, it } from "vitest";
import {
  type ActionTimeline,
  type CharacterDesign,
  type PoseLibrary,
  type RigPlan,
  validateCharacterAnimationInputs,
} from "./index.js";

const characterDesign: CharacterDesign = {
  slug: "host",
  required_actions: ["idle", "point"],
  required_emotions: ["smile"],
  visual_description: "A sharp presenter with a red jacket.",
  references: [],
};

const poseLibrary: PoseLibrary = {
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
    point: {
      description: "Pointing at screen",
      hold_frames: 15,
      transition_to: {},
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
};

const rigPlan: RigPlan = {
  character: "host",
  joints: [
    {
      id: "root",
      parent: null,
      pivot: { x: 0, y: 0 },
      default_rotation_deg: 0,
    },
    {
      id: "mouth_left",
      parent: "root",
      pivot: { x: -3, y: 4 },
      default_rotation_deg: 0,
    },
  ],
  attachment_points: [],
};

const actionTimeline: ActionTimeline = {
  host: [
    { time_s: 0, pose: "idle", transition_frames: 0, ease: "linear" },
    { time_s: 1, pose: "point", transition_frames: 8, ease: "ease_out" },
  ],
};

describe("validateCharacterAnimationInputs", () => {
  it("accepts matching character animation artifacts", () => {
    expect(
      validateCharacterAnimationInputs({
        character_design: characterDesign,
        pose_library: poseLibrary,
        rig_plan: rigPlan,
        action_timeline: actionTimeline,
      }).findings,
    ).toEqual([]);
  });

  it("reports required actions missing from the pose library", () => {
    const result = validateCharacterAnimationInputs({
      character_design: { ...characterDesign, required_actions: ["wave"] },
      pose_library: poseLibrary,
      rig_plan: rigPlan,
      action_timeline: actionTimeline,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_required_action",
        message: expect.stringContaining("wave"),
      }),
    );
  });

  it("reports required emotions missing from the pose library", () => {
    const result = validateCharacterAnimationInputs({
      character_design: { ...characterDesign, required_emotions: ["frown"] },
      pose_library: poseLibrary,
      rig_plan: rigPlan,
      action_timeline: actionTimeline,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_required_emotion",
        message: expect.stringContaining("frown"),
      }),
    );
  });

  it("reports expression joints missing from the rig plan", () => {
    const result = validateCharacterAnimationInputs({
      character_design: characterDesign,
      pose_library: {
        ...poseLibrary,
        expressions: {
          smile: {
            description: "Small smile",
            joints: {
              brow_left: { y: -1 },
            },
          },
        },
      },
      rig_plan: rigPlan,
      action_timeline: actionTimeline,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_rig_joint",
        message: expect.stringContaining("brow_left"),
      }),
    );
  });

  it("reports transition references missing from both poses and rig joints", () => {
    const result = validateCharacterAnimationInputs({
      character_design: characterDesign,
      pose_library: {
        ...poseLibrary,
        poses: {
          ...poseLibrary.poses,
          idle: {
            description: "Neutral standing pose",
            hold_frames: 30,
            transition_to: {
              elbow: {
                transition_frames: 8,
                ease: "ease_out",
              },
            },
          },
        },
      },
      rig_plan: rigPlan,
      action_timeline: actionTimeline,
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_rig_joint",
        message: expect.stringContaining("elbow"),
      }),
    );
  });

  it("allows timeline actions supplied by action cycles", () => {
    const result = validateCharacterAnimationInputs(
      {
        character_design: characterDesign,
        pose_library: poseLibrary,
        rig_plan: rigPlan,
        action_timeline: {
          host: [{ time_s: 0, pose: "walk_cycle", transition_frames: 4, ease: "linear" }],
        },
      },
      { action_cycles: ["walk_cycle"] },
    );

    expect(result.findings).toEqual([]);
  });

  it("reports timeline poses missing from poses and action cycles", () => {
    const result = validateCharacterAnimationInputs({
      character_design: characterDesign,
      pose_library: poseLibrary,
      rig_plan: rigPlan,
      action_timeline: {
        host: [{ time_s: 0, pose: "fly", transition_frames: 4, ease: "linear" }],
      },
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "unknown_timeline_pose",
        message: expect.stringContaining("fly"),
      }),
    );
  });
});
