import { describe, expect, it } from "vitest";
import type { Checkpoint } from "../checkpoints/checkpoint.js";
import { checkSkillCompliance } from "./skill-compliance.js";

const agentSkills = new Map<string, string[]>([
  ["flux", ["flux-best-practices", "bfl-api"]],
  ["no-skills", []],
]);

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    stage: "edit",
    status: "completed",
    timestamp: "2026-05-12T15:42:00Z",
    artifact: {},
    tool_invocations: [{ tool: "flux" }],
    skills_read: [],
    ...overrides,
  };
}

function check(stageSlug: string, input: Checkpoint) {
  return checkSkillCompliance(stageSlug, input, {
    getAgentSkills: (toolName) => agentSkills.get(toolName),
  });
}

describe("checkSkillCompliance", () => {
  it("flags every missing Layer 3 skill as critical by edit stage", () => {
    const findings = check("edit", checkpoint());

    expect(findings).toHaveLength(2);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: "critical",
        title: "Layer 3 skill not read before generation",
        location: "checkpoint.tool_invocations[0]",
        description: expect.stringContaining("flux-best-practices"),
      }),
      expect.objectContaining({
        severity: "critical",
        title: "Layer 3 skill not read before generation",
        location: "checkpoint.tool_invocations[0]",
        description: expect.stringContaining("bfl-api"),
      }),
    ]);
  });

  it("flags missing Layer 3 skills as suggestions at the first generation stage", () => {
    const findings = check(
      "assets",
      checkpoint({
        skills_read: ["flux-best-practices"],
      }),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        severity: "suggestion",
        title: "Layer 3 skill not read before generation",
        description: expect.stringContaining("bfl-api"),
      }),
    ]);
  });

  it("passes when all required tool skills were read", () => {
    expect(
      check(
        "edit",
        checkpoint({
          skills_read: ["skills/agents/flux-best-practices.md", "bfl-api"],
        }),
      ),
    ).toEqual([]);
  });

  it("skips unknown tools", () => {
    expect(
      check(
        "edit",
        checkpoint({
          tool_invocations: [{ tool: "unknown-generator" }],
        }),
      ),
    ).toEqual([]);
  });

  it("skips tools with no agent_skills", () => {
    expect(
      check(
        "edit",
        checkpoint({
          tool_invocations: [{ tool: "no-skills" }],
        }),
      ),
    ).toEqual([]);
  });

  it("does not run before generation stages", () => {
    expect(check("proposal", checkpoint())).toEqual([]);
  });
});
