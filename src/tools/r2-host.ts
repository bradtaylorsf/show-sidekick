import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { encodeS3Key, publicUrl, signPutObject } from "../hosting/aws-sigv4.js";
import { defineTool } from "../registry/index.js";
import { ImageHostInputSchema, ImageHostOutputSchema } from "./catbox-host.js";

export default defineTool({
  name: "r2_host",
  capability: "image_hosting",
  provider: "r2",
  status: "production",
  integration: {
    kind: "api",
    env: [
      "PREDIT_R2_BUCKET",
      "PREDIT_R2_ACCOUNT_ID",
      "PREDIT_R2_ACCESS_KEY_ID",
      "PREDIT_R2_SECRET_ACCESS_KEY",
      "PREDIT_R2_PUBLIC_BASE_URL",
    ],
    install:
      "Set PREDIT_R2_BUCKET, PREDIT_R2_ACCOUNT_ID, PREDIT_R2_ACCESS_KEY_ID, PREDIT_R2_SECRET_ACCESS_KEY, and PREDIT_R2_PUBLIC_BASE_URL.",
  },
  best_for: "Cloudflare R2-backed image hosting with a public bucket or custom domain",
  supports: ["cloudflare-r2", "public-base-url"],
  cost: { unit: "call", usd: 0 },
  input: ImageHostInputSchema,
  output: ImageHostOutputSchema,

  async execute(params) {
    const input = ImageHostInputSchema.parse(params);
    const config = readConfig();
    const key = `predit/${randomUUID()}/${basename(input.local_path)}`;
    const body = await readFile(input.local_path);
    const objectUrl = new URL(
      `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${encodeS3Key(key)}`,
    );
    const signed = signPutObject({
      url: objectUrl,
      body,
      credentials: config.credentials,
      region: "auto",
      contentType: "application/octet-stream",
    });

    const response = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: new Uint8Array(body),
    });

    if (!response.ok) {
      throw new Error(`r2 upload failed: ${response.status} ${await response.text()}`);
    }

    return ImageHostOutputSchema.parse({
      url: publicUrl(config.publicBaseUrl, key),
      expires_at: null,
      cost_usd: 0,
      provider: "r2",
    });
  },
});

function readConfig() {
  return {
    bucket: requiredEnv("PREDIT_R2_BUCKET"),
    accountId: requiredEnv("PREDIT_R2_ACCOUNT_ID"),
    publicBaseUrl: requiredEnv("PREDIT_R2_PUBLIC_BASE_URL"),
    credentials: {
      accessKeyId: requiredEnv("PREDIT_R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("PREDIT_R2_SECRET_ACCESS_KEY"),
    },
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`missing env: ${name}`);
  }

  return value;
}
