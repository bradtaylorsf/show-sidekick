import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { decodeBase64Image, definedEntries, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";
import type { Availability } from "../registry/index.js";

const GOOGLE_IMAGEN_COST_USD = 0.04;
const DEFAULT_MODEL = "imagen-3.0-generate-001";
const DEFAULT_LOCATION = "us-central1";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export const GoogleImagenInputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.string().default("1:1"),
  seed: z.number().int().nonnegative().optional(),
  model: z.string().default(DEFAULT_MODEL),
  location: z.string().default(DEFAULT_LOCATION),
  project: z.string().optional(),
});

export const GoogleImagenOutputSchema = z.object({
  image_path: z.string(),
  provider: z.literal("google"),
  model: z.string(),
  cost_usd: z.number().nonnegative(),
  seed: z.number().int().nonnegative().optional(),
});

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

type TokenResponse = {
  access_token?: string;
};

type ImagenPredictResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    image?: {
      bytesBase64Encoded?: string;
    };
  }>;
};

export default defineTool({
  name: "google_imagen",
  capability: "image_generation",
  provider: "google",
  status: "beta",
  integration: {
    kind: "api",
    env: ["GOOGLE_APPLICATION_CREDENTIALS"],
    install:
      "Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file, or set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_CLOUD_PROJECT.",
  },
  best_for: "Google Imagen API generations through Vertex AI with service-account authentication",
  supports: ["imagen-3", "vertex-ai", "text-to-image"],
  cost: { unit: "image", usd: GOOGLE_IMAGEN_COST_USD },
  agent_skills: ["imagen-api"],
  input: GoogleImagenInputSchema,
  output: GoogleImagenOutputSchema,
  isAvailable: async () => googleAvailability(),

  async execute(params, ctx) {
    const input = GoogleImagenInputSchema.parse(params);
    const account = await readServiceAccount();
    const project = input.project ?? process.env.GOOGLE_CLOUD_PROJECT ?? account.project_id;

    if (!project) {
      throw new Error("missing Google Cloud project: set GOOGLE_CLOUD_PROJECT or project_id in the service account");
    }

    const accessToken = await mintAccessToken(account);
    const url =
      `https://${input.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}` +
      `/locations/${encodeURIComponent(input.location)}/publishers/google/models/${encodeURIComponent(input.model)}:predict`;
    const response = await responseJson<ImagenPredictResponse>(
      await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          instances: [{ prompt: input.prompt }],
          parameters: definedEntries({
            aspectRatio: input.aspect_ratio,
            seed: input.seed,
            sampleCount: 1,
          }),
        }),
      }),
      "google imagen request",
    );
    const base64 = firstPredictionBase64(response);
    const imagePath = await writeGeneratedImage(ctx, decodeBase64Image(base64));

    return GoogleImagenOutputSchema.parse({
      image_path: imagePath,
      provider: "google",
      model: input.model,
      cost_usd: GOOGLE_IMAGEN_COST_USD,
      seed: input.seed,
    });
  },
});

async function googleAvailability(): Promise<Availability> {
  if (hasEnv("GOOGLE_APPLICATION_CREDENTIALS") || hasEnv("GOOGLE_SERVICE_ACCOUNT_JSON")) {
    return { available: true };
  }

  return {
    available: false,
    reason: "missing env: GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON",
    fix: "env",
  };
}

async function readServiceAccount(): Promise<ServiceAccount> {
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inlineJson && inlineJson.trim() !== "") {
    return ServiceAccountSchema.parse(JSON.parse(inlineJson));
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath || credentialsPath.trim() === "") {
    throw new Error("missing env: GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  return ServiceAccountSchema.parse(JSON.parse(await readFile(credentialsPath, "utf8")));
}

const ServiceAccountSchema: z.ZodType<ServiceAccount> = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  project_id: z.string().optional(),
  token_uri: z.string().url().optional(),
});

async function mintAccessToken(account: ServiceAccount): Promise<string> {
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1_000);
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      iss: account.client_email,
      scope: GOOGLE_SCOPE,
      aud: tokenUri,
      iat: now,
      exp: now + 3_600,
    },
    account.private_key,
  );
  const token = await responseJson<TokenResponse>(
    await fetch(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    }),
    "google access token request",
  );

  if (!token.access_token) {
    throw new Error("google access token response did not include access_token");
  }

  return token.access_token;
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string): string {
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function firstPredictionBase64(response: ImagenPredictResponse): string {
  const prediction = response.predictions?.[0];
  const base64 = prediction?.bytesBase64Encoded ?? prediction?.image?.bytesBase64Encoded;

  if (!base64) {
    throw new Error("google imagen response did not include predictions[0].bytesBase64Encoded");
  }

  return base64;
}

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "";
}
