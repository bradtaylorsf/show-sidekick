import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { getUploadCount, recordUpload } from "../registry/host-quota.js";
import { defineTool } from "../registry/index.js";

export const ImageHostInputSchema = z.object({
  local_path: z.string(),
});

export const ImageHostOutputSchema = z.object({
  url: z.string().url(),
  expires_at: z.string().datetime().nullable(),
  cost_usd: z.number().nonnegative(),
  provider: z.string(),
});

export type ImageHostInput = z.infer<typeof ImageHostInputSchema>;
export type ImageHostOutput = z.infer<typeof ImageHostOutputSchema>;

export default defineTool({
  name: "catbox_host",
  capability: "image_hosting",
  provider: "catbox",
  status: "production",
  integration: {
    kind: "api",
    env: [],
    install: "No auth required. catbox.moe is free and has a soft limit of about 50 uploads per day.",
  },
  best_for: "free temporary/public image hosting for image-to-video inputs; catbox has an about 50 uploads/day soft limit",
  supports: ["catbox.moe", "free-hosting", "50-uploads-per-day-soft-limit"],
  cost: { unit: "call", usd: 0 },
  input: ImageHostInputSchema,
  output: ImageHostOutputSchema,
  async isAvailable() {
    const count = getUploadCount("catbox");
    if (count >= 50) {
      return { available: false, reason: "catbox daily quota exhausted", fix: "manual" };
    }

    return { available: true };
  },

  async execute(params, ctx) {
    const input = ImageHostInputSchema.parse(params);
    const quota = recordUpload("catbox", { projectRoot: ctx.projectRoot });
    if (quota.warned) {
      ctx.logger.warn("catbox quota: 40/50 uploads today", { count_today: quota.count_today });
    }

    const body = new FormData();
    const bytes = await readFile(input.local_path);
    body.append("reqtype", "fileupload");
    body.append("fileToUpload", new Blob([bytes]), basename(input.local_path));

    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body,
    });

    const text = (await response.text()).trim();
    if (!response.ok) {
      throw new Error(`catbox upload failed: ${response.status} ${text}`);
    }

    return ImageHostOutputSchema.parse({
      url: text,
      expires_at: null,
      cost_usd: 0,
      provider: "catbox",
    });
  },
});
