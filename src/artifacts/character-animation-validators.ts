import type { ActionTimeline, CharacterDesign, PoseLibrary, RigPlan } from "./index.js";

export type CharacterAnimationValidationFinding = {
  code: string;
  message: string;
};

export type CharacterAnimationValidationInput = {
  character_design: CharacterDesign;
  pose_library: PoseLibrary;
  rig_plan: RigPlan;
  action_timeline: ActionTimeline;
};

export function validateCharacterAnimationInputs(
  input: CharacterAnimationValidationInput,
  options: { action_cycles?: readonly string[] } = {},
): { findings: CharacterAnimationValidationFinding[] } {
  const findings: CharacterAnimationValidationFinding[] = [];
  const poseNames = new Set(Object.keys(input.pose_library.poses));
  const expressionNames = new Set(Object.keys(input.pose_library.expressions));
  const rigJointIds = new Set(input.rig_plan.joints.map((joint) => joint.id));
  const actionCycles = new Set(options.action_cycles ?? []);

  for (const action of input.character_design.required_actions) {
    if (!poseNames.has(action)) {
      findings.push({
        code: "missing_required_action",
        message: `character_design.required_actions includes "${action}", but pose_library.poses does not define it`,
      });
    }
  }

  for (const emotion of input.character_design.required_emotions) {
    if (!expressionNames.has(emotion)) {
      findings.push({
        code: "missing_required_emotion",
        message: `character_design.required_emotions includes "${emotion}", but pose_library.expressions does not define it`,
      });
    }
  }

  for (const [expressionName, expression] of Object.entries(input.pose_library.expressions)) {
    for (const jointId of Object.keys(expression.joints)) {
      if (!rigJointIds.has(jointId)) {
        findings.push({
          code: "missing_rig_joint",
          message: `pose_library.expressions.${expressionName}.joints references "${jointId}", but rig_plan.joints does not define it`,
        });
      }
    }
  }

  for (const [poseName, pose] of Object.entries(input.pose_library.poses)) {
    for (const targetOrJoint of Object.keys(pose.transition_to)) {
      if (!poseNames.has(targetOrJoint) && !rigJointIds.has(targetOrJoint)) {
        findings.push({
          code: "missing_rig_joint",
          message: `pose_library.poses.${poseName}.transition_to references "${targetOrJoint}", but it is not a pose or a rig_plan.joints id`,
        });
      }
    }
  }

  for (const [characterName, entries] of Object.entries(input.action_timeline)) {
    for (const entry of entries) {
      // TODO: Promote action_cycles into the F-10 schema once it has a canonical artifact field.
      if (!poseNames.has(entry.pose) && !actionCycles.has(entry.pose)) {
        findings.push({
          code: "unknown_timeline_pose",
          message: `action_timeline.${characterName} uses pose "${entry.pose}", but it is not in pose_library.poses or action_cycles`,
        });
      }
    }
  }

  return { findings };
}
