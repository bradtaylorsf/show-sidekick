import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import {
  ActionTimelineSchema,
  AssetManifestSchema,
  AudioEnergySchema,
  AudioArchitectureSchema,
  BriefSchema,
  CaptureManifestSchema,
  CharacterDesignSchema,
  CharacterQaReportSchema,
  CostLogSchema,
  CuesheetSchema,
  DeckManifestSchema,
  DecisionLogSchema,
  EditDecisionsSchema,
  EndTagPlanSchema,
  FinalReviewSchema,
  LyricsAlignmentOverridesSchema,
  LyricsAlignedSchema,
  PoseLibrarySchema,
  ProposalPacketSchema,
  PublishLogSchema,
  RenderReportSchema,
  RenderRuntimeSchema,
  ResearchBriefSchema,
  ReviewSchema,
  RigPlanSchema,
  ScenePlanSchema,
  ScriptSchema,
  SourceMediaReviewSchema,
  VideoAnalysisBriefSchema,
} from "../src/artifacts/index.js";
import { ArtifactJsonSchemas, type ArtifactJsonSchemaName } from "../src/artifacts/json-schema.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const fixturesDir = path.join(repoRoot, "bundled", "fixtures", "schemas");
const bundledSchemasDir = path.join(repoRoot, "bundled", "schemas", "artifacts");

const zodSchemasByArtifact = {
  action_timeline: ActionTimelineSchema,
  audio_energy: AudioEnergySchema,
  asset_manifest: AssetManifestSchema,
  audio_architecture: AudioArchitectureSchema,
  brief: BriefSchema,
  capture_manifest: CaptureManifestSchema,
  character_design: CharacterDesignSchema,
  character_qa_report: CharacterQaReportSchema,
  cost_log: CostLogSchema,
  cuesheet: CuesheetSchema,
  deck_manifest: DeckManifestSchema,
  decision_log: DecisionLogSchema,
  edit_decisions: EditDecisionsSchema,
  end_tag_plan: EndTagPlanSchema,
  final_review: FinalReviewSchema,
  lyrics_aligned: LyricsAlignedSchema,
  lyrics_alignment_overrides: LyricsAlignmentOverridesSchema,
  pose_library: PoseLibrarySchema,
  proposal_packet: ProposalPacketSchema,
  publish_log: PublishLogSchema,
  render_report: RenderReportSchema,
  render_runtime: RenderRuntimeSchema,
  research_brief: ResearchBriefSchema,
  review: ReviewSchema,
  rig_plan: RigPlanSchema,
  scene_plan: ScenePlanSchema,
  script: ScriptSchema,
  source_media_review: SourceMediaReviewSchema,
  video_analysis_brief: VideoAnalysisBriefSchema,
} satisfies Record<ArtifactJsonSchemaName, ZodTypeAny>;

describe("artifact schema fixtures", () => {
  it("round-trips every artifact fixture through its Zod schema", async () => {
    const artifactNames = Object.keys(ArtifactJsonSchemas).sort() as ArtifactJsonSchemaName[];
    const fixtureNames = await fixtureArtifactNames();

    expect(Object.keys(zodSchemasByArtifact).sort()).toEqual(artifactNames);
    expect(fixtureNames).toEqual(artifactNames);

    for (const artifactName of artifactNames) {
      const fixturePath = path.join(fixturesDir, `${artifactName}.json`);
      const rawFixture = await readFile(fixturePath, "utf8");
      const fixture = JSON.parse(rawFixture) as unknown;
      const schema = zodSchemasByArtifact[artifactName];

      const parsed = schema.parse(fixture);
      const serialized = JSON.stringify(parsed);
      const reparsed = schema.parse(JSON.parse(serialized));

      expect(reparsed, artifactName).toEqual(parsed);
    }
  });

  it("keeps generated artifact JSON schemas in sync with the source registry", async () => {
    const mismatches: string[] = [];

    for (const [artifactName, schema] of Object.entries(ArtifactJsonSchemas)) {
      const schemaPath = path.join(bundledSchemasDir, `${artifactName}.schema.json`);
      const rawSchema = await readFile(schemaPath, "utf8");
      const expected = `${JSON.stringify(schema, null, 2)}\n`;

      if (rawSchema !== expected) {
        mismatches.push(artifactName);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

async function fixtureArtifactNames(): Promise<string[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .filter((name) => !name.includes("."))
    .sort();
}
