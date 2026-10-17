import { comfyToolAvailability, getComfyClient } from "../comfy/availability.js";
import { ComfyVideoInputSchema, ComfyVideoOutputSchema, runComfyVideo } from "../comfy/video-tool.js";
import { defineTool } from "../registry/define-tool.js";

export default defineTool({
  name: "comfy_text_to_video",
  capability: "text_to_video",
  provider: "comfyui",
  status: "beta",
  integration: { kind: "api", env: [], install: "showkick setup comfy" },
  best_for:
    "Default local text-to-video through your own ComfyUI: Wan 2.2 TI2V-5B, or LTX-2.5 with native audio. No provider charge.",
  supports: ["local-default", "local-gpu", "text-to-video", "wan-2.2", "ltx-2.5", "native-audio"],
  cost: { unit: "clip", usd: 0 },
  agent_skills: ["comfyui-local", "ai-video-gen"],
  input: ComfyVideoInputSchema,
  output: ComfyVideoOutputSchema,
  isAvailable: () => comfyToolAvailability(getComfyClient(), "video", ["text_to_video"]),
  execute: (params, ctx) => runComfyVideo(params, ctx, { tool: "comfy_text_to_video", forceMode: "text_to_video" }),
});
