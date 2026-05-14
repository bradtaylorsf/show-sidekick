import { describe, expect, it } from "vitest";
import type { Checkpoint } from "../checkpoints/index.js";
import { formatApprovalBlock, formatApprovalEvents, writeApprovalBlock, type ApprovalContext } from "./approval.js";

describe("approval presentation", () => {
  it("renders the five fixed sections in order", () => {
    const block = formatApprovalBlock(checkpoint(), approvalContext());
    const headings = [
      "## Stage complete: scene_plan",
      "### Artifact summary",
      "### Review findings",
      "### Cost so far",
      "### Action",
    ];
    const indexes = headings.map((heading) => block.indexOf(heading));

    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
  });

  it("limits artifact summaries to five bullets with an explicit overflow tail", () => {
    const block = formatApprovalBlock(
      checkpoint(),
      approvalContext({
        artifactSummary: ["one", "two", "three", "four", "five", "six"],
      }),
    );
    const lines = sectionLines(block, "### Artifact summary", "### Review findings");

    expect(lines.filter((line) => line.startsWith("- "))).toEqual([
      "- one",
      "- two",
      "- three",
      "- four",
      "- ... (2 more)",
    ]);
  });

  it("shows every critical finding description and proposed fix in full", () => {
    const firstDescription = "A".repeat(600);
    const firstFix = "B".repeat(600);
    const secondDescription = "C".repeat(600);
    const secondFix = "D".repeat(600);
    const block = formatApprovalBlock(
      checkpoint({
        findings: [
          {
            severity: "critical",
            title: "Missing climax alignment",
            location: "scene 11",
            description: firstDescription,
            proposed_fix: firstFix,
          },
          {
            severity: "suggestion",
            title: "Tighter cutaway",
            description: "This should be summarized by count only.",
            proposed_fix: "Do not render this body.",
          },
          {
            severity: "critical",
            title: "Invalid caption timing",
            description: secondDescription,
            proposed_fix: secondFix,
          },
        ],
      }),
      approvalContext(),
    );

    expect(block).toContain(firstDescription);
    expect(block).toContain(firstFix);
    expect(block).toContain(secondDescription);
    expect(block).toContain(secondFix);
    expect(block).not.toContain("This should be summarized by count only.");
  });

  it("renders a full patch payload for a critical finding without proposed_fix", () => {
    const patch = {
      artifact_path: "scenes.3.duration_s",
      new_value: {
        from: 9.25,
        to: 5,
        reason: "exceeds max_scene_duration_s",
      },
    };
    const block = formatApprovalBlock(
      checkpoint({
        findings: [
          {
            severity: "critical",
            title: "Scene duration too long",
            description: "Scene 3 breaks the declared max duration.",
            patch,
          },
        ],
      }),
      approvalContext(),
    );

    expect(block).toContain("Patch:");
    expect(block).toContain(JSON.stringify(patch, null, 2));
  });

  it("uses review summary counts in the findings section", () => {
    const block = formatApprovalBlock(
      checkpoint({
        critical: 2,
        suggestions: 3,
        nitpicks: 4,
      }),
      approvalContext(),
    );

    expect(block).toContain("Critical: 2 | Suggestions: 3 | Nitpicks: 4");
  });

  it("includes stage, total, remaining, and projection in the cost section", () => {
    const block = formatApprovalBlock(
      checkpoint(),
      approvalContext({
        projectedRemainingTotals: {
          sample: 1.25,
          full: 6.5,
        },
      }),
    );

    expect(block).toContain("$1.18 of $5.00 budget ($3.82 remaining). This stage: $0.42.");
    expect(block).toContain("Next stage (assets) estimates $2.40 full / $0.40 sample.");
    expect(block).toContain("Projected remaining: $6.50 full / $1.25 sample.");
  });

  it("omits the projection sentence when no projected next stage is supplied", () => {
    const block = formatApprovalBlock(
      checkpoint(),
      approvalContext({
        projectedNextStage: undefined,
      }),
    );

    expect(block).toContain("$1.18 of $5.00 budget ($3.82 remaining). This stage: $0.42.");
    expect(block).not.toContain("Next stage");
  });

  it("emits exactly five JSON-mode events in fixed order with matching data", () => {
    const writes: string[] = [];
    const checkpointValue = checkpoint({
      critical: 1,
      findings: [
        {
          severity: "critical",
          title: "Broken scene order",
          description: "Scene order violates the beat map.",
          proposed_fix: "Move the reveal after the chorus downbeat.",
        },
      ],
    });
    const ctx = approvalContext({
      artifactSummary: ["one", "two", "three", "four", "five", "six"],
    });

    writeApprovalBlock(
      {
        stdout: {
          write(chunk: string) {
            writes.push(chunk);
            return true;
          },
        },
        stderr: {
          write() {
            return true;
          },
        },
      },
      checkpointValue,
      ctx,
      { json: true },
    );

    const events = writes.map((line) => JSON.parse(line) as ReturnType<typeof formatApprovalEvents>[number]);
    expect(events.map((event) => event.event)).toEqual([
      "approval_block_start",
      "artifact_summary",
      "review_findings",
      "cost_snapshot",
      "action_options",
    ]);
    expect(events).toEqual(formatApprovalEvents(checkpointValue, ctx).map((event) => JSON.parse(JSON.stringify(event))));
    expect(events[1]).toMatchObject({
      bullets: ["one", "two", "three", "four", "... (2 more)"],
    });
    expect(events[2]).toMatchObject({
      counts: {
        critical: 1,
        suggestions: 2,
        nitpicks: 1,
      },
      critical_findings: [
        {
          title: "Broken scene order",
          description: "Scene order violates the beat map.",
          proposed_fix: "Move the reveal after the chorus downbeat.",
        },
      ],
    });
    expect(events[3]).not.toHaveProperty("projected_remaining_totals");
    expect(events[4]).toMatchObject({
      actions: ["approve", "revise", "abort"],
    });
  });

  it("omits critical finding sub-blocks when no critical findings exist", () => {
    const block = formatApprovalBlock(
      checkpoint({
        critical: 0,
        findings: [
          {
            severity: "suggestion",
            title: "Try a wider shot",
            description: "The middle could breathe more.",
          },
        ],
      }),
      approvalContext(),
    );

    expect(block).toContain("Critical: 0 | Suggestions: 2 | Nitpicks: 1");
    expect(block).not.toContain("#### Critical finding:");
  });
});

function checkpoint(overrides: Partial<Checkpoint["review_summary"]> = {}): Checkpoint {
  return {
    stage: "scene_plan",
    status: "awaiting_human",
    timestamp: "2026-05-12T15:42:00Z",
    artifact: { scenes: 18 },
    review_summary: {
      rounds: 1,
      critical: 0,
      suggestions: 2,
      nitpicks: 1,
      findings: [],
      ...overrides,
    },
    cost_snapshot: {
      stage_cost_usd: 0.42,
      total_so_far_usd: 1.18,
      budget_remaining_usd: 3.82,
    },
    tool_invocations: [],
  };
}

function approvalContext(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    stageCost: 0.42,
    totalSoFar: 1.18,
    budgetRemaining: 3.82,
    projectedNextStage: {
      stage: "assets",
      full: 2.4,
      sample: 0.4,
    },
    artifactSummary: ["18 scenes spanning 3:14"],
    ...overrides,
  };
}

function sectionLines(block: string, startHeading: string, endHeading: string): string[] {
  const start = block.indexOf(startHeading);
  const end = block.indexOf(endHeading);
  return block
    .slice(start + startHeading.length, end)
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
