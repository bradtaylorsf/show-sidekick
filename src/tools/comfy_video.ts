import { comfyToolAvailability, getComfyClient } from "../comfy/availability.js";
import { ComfyVideoInputSchema, ComfyVideoOutputSchema, runComfyVideo } from "../comfy/video-tool.js";
import { defineTool } from "../registry/define-tool.js";

export default defineTool({
  name: "comfy_video",
  capability: "image_to_video",
  provider: "comfyui",
  status: "beta",
  integration: { kind: "api", env: [], install: "showkick setup comfy" },
  best_for:
    "Default local image-to-video and first/last-frame clips through your own ComfyUI: Wan 2.2 I2V-A14B (Q8 GGUF, 4-step), Wan 2.2 TI2V-5B, LTX-2.5 with native audio. No provider charge.",
  supports: [
    "local-default",
    "local-gpu",
    "image-to-video",
    "first-last-frame",
    "text-to-video",
    "wan-2.2",
    "ltx-2.5",
    "native-audio",
  ],
  cost: { unit: "clip", usd: 0 },
  agent_skills: ["comfyui-local", "ai-video-gen"],
  input: ComfyVideoInputSchema,
  output: ComfyVideoOutputSchema,
  isAvailable: () => comfyToolAvailability(getComfyClient(), "video", ["image_to_video", "first_last_frame"]),
  execute: (params, ctx) => runComfyVideo(params, ctx, { tool: "comfy_video" }),
});
