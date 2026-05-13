import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetManifest, DecisionLog, EditDecisions, ProposalPacket, RenderRuntime } from "../artifacts/index.js";
import { validatePreCompose } from "./pre-compose-validation.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("validatePreCompose", () => {
  it("passes when assets exist, runtime matches, motion floor is met, and cuts cover the timeline", async () => {
    const projectRoot = await tempDir();
    const assetPath = await writeAsset(projectRoot, "hero.mp4");

    const result = validatePreCompose({
      edit_decisions: editDecisions(),
      proposal_packet: proposalPacket({ motionLed: true }),
      asset_manifest: assetManifest(assetPath, "video"),
      projectRoot,
    });

    expect(result.status).toBe("passed");
    expect(result.motion_ratio_actual).toBe(1);
    expect(result.findings.every((finding) => finding.status === "pass")).toBe(true);
  });

  it("fails motion-led promises when the motion ratio is below the floor", async () => {
    const projectRoot = await tempDir();
    const assetPath = await writeAsset(projectRoot, "still.png");

    const result = validatePreCompose({
      edit_decisions: editDecisions(),
      proposal_packet: proposalPacket({ motionLed: true }),
      asset_manifest: assetManifest(assetPath, "image"),
      projectRoot,
    });

    expect(result.status).toBe("failed");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        check: "delivery_promise",
        status: "fail",
      }),
    );
  });

  it("fails runtime mismatches unless a superseding runtime decision is logged", async () => {
    const projectRoot = await tempDir();
    const assetPath = await writeAsset(projectRoot, "hero.mp4");
    const mismatchedProposal = proposalPacket({ runtime: "remotion" });

    const failed = validatePreCompose({
      edit_decisions: editDecisions({ runtime: "ffmpeg" }),
      proposal_packet: mismatchedProposal,
      asset_manifest: assetManifest(assetPath, "video"),
      projectRoot,
    });
    expect(failed.status).toBe("failed");
    expect(failed.findings).toContainEqual(expect.objectContaining({ check: "runtime_match", status: "fail" }));

    const passed = validatePreCompose({
      edit_decisions: editDecisions({ runtime: "ffmpeg" }),
      proposal_packet: mismatchedProposal,
      asset_manifest: assetManifest(assetPath, "video"),
      decision_log: supersedingDecisionLog("remotion", "ffmpeg"),
      projectRoot,
    });
    expect(passed.findings).toContainEqual(expect.objectContaining({ check: "runtime_match", status: "pass" }));
  });

  it("fails when referenced asset paths are missing", async () => {
    const projectRoot = await tempDir();

    const result = validatePreCompose({
      edit_decisions: editDecisions(),
      proposal_packet: proposalPacket(),
      asset_manifest: assetManifest(join(projectRoot, "missing.mp4"), "video"),
      projectRoot,
    });

    expect(result.status).toBe("failed");
    expect(result.findings).toContainEqual(expect.objectContaining({ check: "asset_paths_exist", status: "fail" }));
  });

  it("fails clearly when no asset manifest is supplied", async () => {
    const projectRoot = await tempDir();

    const result = validatePreCompose({
      edit_decisions: editDecisions(),
      proposal_packet: proposalPacket(),
      projectRoot,
    });

    expect(result.status).toBe("failed");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        check: "asset_manifest_required",
        status: "fail",
        detail: expect.not.stringContaining("Missing assets: hero"),
      }),
    );
  });

  it("fails when cuts leave timeline gaps", async () => {
    const projectRoot = await tempDir();
    const assetPath = await writeAsset(projectRoot, "hero.mp4");

    const result = validatePreCompose({
      edit_decisions: editDecisions({
        cuts: [
          { start_s: 0, end_s: 2, asset_id: "hero" },
          { start_s: 3, end_s: 5, asset_id: "hero" },
        ],
      }),
      proposal_packet: proposalPacket(),
      asset_manifest: assetManifest(assetPath, "video"),
      projectRoot,
    });

    expect(result.status).toBe("failed");
    expect(result.findings).toContainEqual(expect.objectContaining({ check: "cut_coverage", status: "fail" }));
  });

  it("fails when cuts do not cover the planned duration", async () => {
    const projectRoot = await tempDir();
    const assetPath = await writeAsset(projectRoot, "hero.mp4");

    const result = validatePreCompose({
      edit_decisions: editDecisions(),
      proposal_packet: proposalPacket(),
      asset_manifest: assetManifest(assetPath, "video"),
      planned_duration_s: 8,
      projectRoot,
    });

    expect(result.status).toBe("failed");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        check: "cut_coverage",
        status: "fail",
        detail: "Cuts cover 0s through 4s, but planned duration is 8s.",
      }),
    );
  });

  it("does not accept supersessions that point at unrelated decisions", async () => {
    const projectRoot = await tempDir();
    const assetPath = await writeAsset(projectRoot, "hero.mp4");
    const mismatchedProposal = proposalPacket({ runtime: "remotion" });

    const result = validatePreCompose({
      edit_decisions: editDecisions({ runtime: "ffmpeg" }),
      proposal_packet: mismatchedProposal,
      asset_manifest: assetManifest(assetPath, "video"),
      decision_log: [
        unrelatedDecision("runtime-1"),
        ...supersedingDecisionLog("remotion", "ffmpeg").slice(1),
      ],
      projectRoot,
    });

    expect(result.status).toBe("failed");
    expect(result.findings).toContainEqual(expect.objectContaining({ check: "runtime_match", status: "fail" }));
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "predit-precompose-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeAsset(projectRoot: string, name: string): Promise<string> {
  const path = join(projectRoot, name);
  await writeFile(path, "fixture");
  return path;
}

function editDecisions(
  options: { runtime?: RenderRuntime; cuts?: EditDecisions["cuts"] } = {},
): EditDecisions {
  return {
    cuts: options.cuts ?? [{ start_s: 0, end_s: 4, asset_id: "hero" }],
    overlays: [],
    render_runtime: options.runtime ?? "ffmpeg",
    renderer_family: "screen-demo",
  };
}

function proposalPacket(options: { runtime?: RenderRuntime; motionLed?: boolean } = {}): ProposalPacket {
  return {
    concept_options: [
      { slug: "a", hook: "A", treatment: "First treatment." },
      { slug: "b", hook: "B", treatment: "Second treatment." },
      { slug: "c", hook: "C", treatment: "Third treatment." },
    ],
    production_plan: {
      render_runtime: options.runtime ?? "ffmpeg",
      renderer_family: "screen-demo",
      audio_architecture: "no_narration",
    },
    delivery_promise: {
      motion_led: options.motionLed ?? false,
      narration_present: false,
      music_present: false,
    },
    decision_log_ref: "decision-log.json",
  };
}

function assetManifest(path: string, kind: string): AssetManifest {
  return {
    assets: [{ id: "hero", kind, path }],
  };
}

function supersedingDecisionLog(expected: RenderRuntime, actual: RenderRuntime): DecisionLog {
  return [
    {
      id: "runtime-1",
      stage: "proposal",
      timestamp: "2026-05-13T00:00:00Z",
      category: "render_runtime_selection",
      options_considered: [
        { label: expected, rejected_because: null },
        { label: actual, rejected_because: "not selected" },
      ],
      picked: expected,
      reason: "Initial runtime selection.",
      confidence: 0.85,
      user_visible: true,
      supersedes: null,
    },
    {
      id: "runtime-2",
      stage: "edit",
      timestamp: "2026-05-13T00:00:00Z",
      category: "render_runtime_selection",
      options_considered: [
        { label: expected, rejected_because: "superseded by user approval" },
        { label: actual, rejected_because: null },
      ],
      picked: actual,
      reason: "User approved the runtime switch.",
      confidence: 0.9,
      user_visible: true,
      supersedes: "runtime-1",
    },
  ];
}

function unrelatedDecision(id: string): DecisionLog[number] {
  return {
    id,
    stage: "assets",
    timestamp: "2026-05-13T00:00:00Z",
    category: "provider_selection",
    options_considered: [
      { label: "openai", rejected_because: null },
      { label: "imagen", rejected_because: "not configured" },
    ],
    picked: "openai",
    reason: "OpenAI is configured for this fixture.",
    confidence: 0.8,
    user_visible: true,
    supersedes: null,
  };
}
