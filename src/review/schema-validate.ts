import { z } from "zod";
import { ActionTimelineSchema } from "../artifacts/action-timeline.js";
import { AudioEnergySchema } from "../artifacts/audio-energy.js";
import { AssetManifestSchema } from "../artifacts/asset-manifest.js";
import { BriefSchema } from "../artifacts/brief.js";
import { CharacterDesignSchema } from "../artifacts/character-design.js";
import { CharacterQaReportSchema } from "../artifacts/character-qa-report.js";
import { CostLogSchema } from "../artifacts/cost-log.js";
import { DecisionLogSchema } from "../artifacts/decision-log.js";
import { EditDecisionsSchema } from "../artifacts/edit-decisions.js";
import { EndTagPlanSchema } from "../artifacts/end-tag-plan.js";
import { FinalReviewSchema } from "../artifacts/final-review.js";
import { LyricsAlignmentOverridesSchema } from "../artifacts/lyrics-alignment-overrides.js";
import { LyricsAlignedSchema } from "../artifacts/lyrics-aligned.js";
import { PoseLibrarySchema } from "../artifacts/pose-library.js";
import { ProposalPacketSchema } from "../artifacts/proposal-packet.js";
import { RenderReportSchema } from "../artifacts/render-report.js";
import { ResearchBriefSchema } from "../artifacts/research-brief.js";
import { ReviewSchema, type Finding } from "../artifacts/review.js";
import { RigPlanSchema } from "../artifacts/rig-plan.js";
import { ScenePlanSchema } from "../artifacts/scene-plan.js";
import { ScriptSchema } from "../artifacts/script.js";
import { SourceMediaReviewSchema } from "../artifacts/source-media-review.js";
import { VideoAnalysisBriefSchema } from "../artifacts/video-analysis-brief.js";

const ARTIFACT_SCHEMAS = {
  action_timeline: ActionTimelineSchema,
  audio_energy: AudioEnergySchema,
  asset_manifest: AssetManifestSchema,
  assets: AssetManifestSchema,
  brief: BriefSchema,
  character_design: CharacterDesignSchema,
  character_qa_report: CharacterQaReportSchema,
  compose: RenderReportSchema,
  cost_log: CostLogSchema,
  decision_log: DecisionLogSchema,
  edit: EditDecisionsSchema,
  edit_decisions: EditDecisionsSchema,
  end_tag_plan: EndTagPlanSchema,
  final_review: FinalReviewSchema,
  lyrics_aligned: LyricsAlignedSchema,
  lyrics_alignment_overrides: LyricsAlignmentOverridesSchema,
  idea: BriefSchema,
  pose_library: PoseLibrarySchema,
  proposal: ProposalPacketSchema,
  proposal_packet: ProposalPacketSchema,
  render_report: RenderReportSchema,
  research: ResearchBriefSchema,
  research_brief: ResearchBriefSchema,
  review: ReviewSchema,
  rig_plan: RigPlanSchema,
  scene_plan: ScenePlanSchema,
  script: ScriptSchema,
  source_media_review: SourceMediaReviewSchema,
  video_analysis_brief: VideoAnalysisBriefSchema,
} satisfies Record<string, z.ZodTypeAny>;

export type KnownArtifactSchemaKey = keyof typeof ARTIFACT_SCHEMAS;

export function validateArtifactAgainstSchema(stageOrArtifactSlug: string, artifact: unknown): Finding[] {
  const schema = schemaFor(stageOrArtifactSlug);
  if (schema === undefined) {
    return [];
  }

  const result = schema.safeParse(artifact);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => schemaIssueFinding(stageOrArtifactSlug, issue));
}

function schemaFor(stageOrArtifactSlug: string): z.ZodTypeAny | undefined {
  return ARTIFACT_SCHEMAS[stageOrArtifactSlug as KnownArtifactSchemaKey];
}

function schemaIssueFinding(stageOrArtifactSlug: string, issue: z.ZodIssue): Finding {
  const issuePath = formatZodPath(issue.path);
  const location = issuePath.length > 0 ? `${stageOrArtifactSlug}.${issuePath}` : stageOrArtifactSlug;

  return {
    severity: "critical",
    title: `Schema validation failed at ${location}`,
    location,
    description: issue.message,
    proposed_fix: `Update ${location} to satisfy the schema error "${issue.message}" before rerunning review round 1.`,
    patch: {
      artifact_path: location,
      new_value: null,
    },
    status: "pending",
  };
}

function formatZodPath(path: (string | number)[]): string {
  return path.reduce<string>((formattedPath, segment) => {
    if (typeof segment === "number") {
      return `${formattedPath}[${segment}]`;
    }

    if (formattedPath.length === 0) {
      return segment;
    }

    return `${formattedPath}.${segment}`;
  }, "");
}
