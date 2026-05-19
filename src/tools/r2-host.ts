import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { BRANDING } from "../branding.js";
import { encodeS3Key, publicUrl, signPutObject } from "../hosting/aws-sigv4.js";
import { LegacyEnvVarError, MissingEnvError } from "../paths/errors.js";
import { requireProcessEnv } from "../paths/env.js";
import { defineTool } from "../registry/index.js";
import { ImageHostInputSchema, ImageHostOutputSchema } from "./catbox-host.js";

const R2_ENV = {
  bucket: "SHOW_SIDEKICK_R2_BUCKET",
  accountId: "SHOW_SIDEKICK_R2_ACCOUNT_ID",
  accessKeyId: "SHOW_SIDEKICK_R2_ACCESS_KEY_ID",
  secretAccessKey: "SHOW_SIDEKICK_R2_SECRET_ACCESS_KEY",
  publicBaseUrl: "SHOW_SIDEKICK_R2_PUBLIC_BASE_URL",
} as const;

export default defineTool({
  name: "r2_host",
  capability: "image_hosting",
  provider: "r2",
  status: "production",
  integration: {
    kind: "api",
    env: Object.values(R2_ENV),
    install:
      "Set SHOW_SIDEKICK_R2_BUCKET, SHOW_SIDEKICK_R2_ACCOUNT_ID, SHOW_SIDEKICK_R2_ACCESS_KEY_ID, SHOW_SIDEKICK_R2_SECRET_ACCESS_KEY, and SHOW_SIDEKICK_R2_PUBLIC_BASE_URL.",
  },
  best_for: "Cloudflare R2-backed image hosting with a public bucket or custom domain",
  supports: ["cloudflare-r2", "public-base-url"],
  cost: { unit: "call", usd: 0 },
  input: ImageHostInputSchema,
  output: ImageHostOutputSchema,

  async execute(params) {
    const input = ImageHostInputSchema.parse(params);
    const config = readConfig();
    const key = `${BRANDING.packageName}/${randomUUID()}/${basename(input.local_path)}`;
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
    bucket: requiredToolEnv(R2_ENV.bucket),
    accountId: requiredToolEnv(R2_ENV.accountId),
    publicBaseUrl: requiredToolEnv(R2_ENV.publicBaseUrl),
    credentials: {
      accessKeyId: requiredToolEnv(R2_ENV.accessKeyId),
      secretAccessKey: requiredToolEnv(R2_ENV.secretAccessKey),
    },
  };
}

function requiredToolEnv(name: string): string {
  try {
    const value = requireProcessEnv(name);
    if (value.trim() !== "") {
      return value;
    }
    throw new Error(`missing env: ${name}`);
  } catch (error) {
    if (error instanceof MissingEnvError) {
      throw new Error(`missing env: ${name}`);
    }
    if (error instanceof LegacyEnvVarError) {
      throw new Error(error.message);
    }
    throw error;
  }
}
