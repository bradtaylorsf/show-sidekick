import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import characterAnimation, { estimateCharacterAnimationDuration } from "./character-animation.js";

function ctx(projectRoot: string, runCli = vi.fn(async () => ({ stdout: "", stderr: "" }))) {
  return {
    projectRoot,
    runCli,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}

const fixture = {
  character_design: {
    slug: "host",
    required_actions: ["idle", "point"],
    required_emotions: ["smile"],
    visual_description: "A sharp presenter with a red jacket.",
    references: [],
  },
  pose_library: {
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
  },
  rig_plan: {
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
  },
  action_timeline: {
    host: [
      { time_s: 0, pose: "idle", transition_frames: 0, ease: "linear" },
      { time_s: 1, pose: "point", transition_frames: 8, ease: "ease_out" },
    ],
  },
  output_path: "host-animation.mp4",
  fps: 30,
};

describe("character_animation", () => {
  it("registers the character animation capability", async () => {
    expect(characterAnimation.name).toBe("character_animation");
    expect(characterAnimation.capability).toBe("character_animation");
    expect(characterAnimation.integration).toMatchObject({ kind: "binary", binary: "ffmpeg" });
  });

  it("parses input and output schemas", () => {
    expect(characterAnimation.input.parse(fixture).character_design.slug).toBe("host");

    expect(
      characterAnimation.output.parse({
        video_path: "host-animation.mp4",
        duration_s: 1.5,
        frame_count: 45,
      }).provider_metadata,
    ).toEqual({});
  });

  it("estimates fixture duration from the final pose hold frames", () => {
    expect(estimateCharacterAnimationDuration(characterAnimation.input.parse(fixture))).toBe(1.5);
  });

  it("returns deterministic render metadata for valid artifacts", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-character-animation-"));
    const outputPath = join(projectRoot, "host-animation.mp4");
    const runCli = vi.fn(async (_command: string, args: string[]) => {
      await writeFile(args.at(-1) as string, "mp4");
      return { stdout: "", stderr: "" };
    });

    await expect(characterAnimation.execute({ ...fixture, output_path: outputPath }, ctx(projectRoot, runCli))).resolves.toEqual({
      video_path: outputPath,
      duration_s: 1.5,
      frame_count: 45,
      provider_metadata: {},
    });
    await expect(stat(outputPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    expect(runCli).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-t", "1.5", outputPath]), {});
  });

  it("throws validator findings before rendering invalid artifacts", async () => {
    await expect(
      characterAnimation.execute(
        {
          ...fixture,
          character_design: {
            ...fixture.character_design,
            required_actions: ["wave"],
          },
        },
        ctx("/tmp/predit"),
      ),
    ).rejects.toThrow(/required_actions includes "wave"/);
  });
});
