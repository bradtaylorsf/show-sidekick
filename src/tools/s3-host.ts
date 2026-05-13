import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { encodeS3Key, presignGetObject, publicUrl, signPutObject } from "../hosting/aws-sigv4.js";
import { defineTool } from "../registry/index.js";
import { ImageHostInputSchema, ImageHostOutputSchema } from "./catbox-host.js";

const DEFAULT_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export default defineTool({
  name: "s3_host",
  capability: "image_hosting",
  provider: "s3",
  status: "production",
  integration: {
    kind: "api",
    env: ["PREDIT_S3_BUCKET", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    install: "Set PREDIT_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.",
  },
  best_for: "S3-backed image hosting with an env-var configured bucket",
  supports: ["s3", "presigned-url", "public-base-url"],
  cost: { unit: "call", usd: 0 },
  input: ImageHostInputSchema,
  output: ImageHostOutputSchema,

  async execute(params) {
    const input = ImageHostInputSchema.parse(params);
    const config = readConfig();
    const key = `predit/${randomUUID()}/${basename(input.local_path)}`;
    const body = await readFile(input.local_path);
    const objectUrl = new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodeS3Key(key)}`);
    const signed = signPutObject({
      url: objectUrl,
      body,
      credentials: config.credentials,
      region: config.region,
      contentType: "application/octet-stream",
    });

    const response = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: new Uint8Array(body),
    });

    if (!response.ok) {
      throw new Error(`s3 upload failed: ${response.status} ${await response.text()}`);
    }

    const url = config.publicBaseUrl
      ? publicUrl(config.publicBaseUrl, key)
      : presignGetObject({
          url: objectUrl,
          credentials: config.credentials,
          region: config.region,
          expiresInSeconds: config.expiresInSeconds,
        });

    return ImageHostOutputSchema.parse({
      url,
      expires_at: config.publicBaseUrl ? null : new Date(Date.now() + config.expiresInSeconds * 1_000).toISOString(),
      cost_usd: 0,
      provider: "s3",
    });
  },
});

function readConfig() {
  const bucket = requiredEnv("PREDIT_S3_BUCKET");
  const region = requiredEnv("AWS_REGION");
  const accessKeyId = requiredEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("AWS_SECRET_ACCESS_KEY");
  const expiresInSeconds = Number(process.env.PREDIT_S3_PRESIGN_EXPIRES_S ?? DEFAULT_EXPIRES_SECONDS);

  return {
    bucket,
    region,
    publicBaseUrl: process.env.PREDIT_S3_PUBLIC_BASE_URL,
    expiresInSeconds: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : DEFAULT_EXPIRES_SECONDS,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.AWS_SESSION_TOKEN,
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
