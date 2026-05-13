import { createHash, createHmac } from "node:crypto";

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type SignedPutRequest = {
  url: string;
  headers: Record<string, string>;
};

export function encodeS3Key(key: string): string {
  return key
    .split("/")
    .map((part) => encodeRfc3986(part))
    .join("/");
}

export function signPutObject(options: {
  url: URL;
  body: Uint8Array;
  credentials: AwsCredentials;
  region: string;
  service?: string;
  contentType?: string;
  now?: Date;
}): SignedPutRequest {
  const service = options.service ?? "s3";
  const { amzDate, dateStamp } = formatAmzDate(options.now ?? new Date());
  const payloadHash = sha256Hex(options.body);
  const headers: Record<string, string> = {
    host: options.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }

  if (options.credentials.sessionToken) {
    headers["x-amz-security-token"] = options.credentials.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort();
  const canonicalRequest = [
    "PUT",
    options.url.pathname,
    "",
    canonicalHeaders(headers, signedHeaders),
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(signingKey(options.credentials.secretAccessKey, dateStamp, options.region, service), stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${options.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.join(
    ";",
  )}, Signature=${signature}`;

  return {
    url: options.url.toString(),
    headers: {
      ...Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "host")),
      authorization,
    },
  };
}

export function presignGetObject(options: {
  url: URL;
  credentials: AwsCredentials;
  region: string;
  expiresInSeconds: number;
  service?: string;
  now?: Date;
}): string {
  const service = options.service ?? "s3";
  const { amzDate, dateStamp } = formatAmzDate(options.now ?? new Date());
  const credentialScope = `${dateStamp}/${options.region}/${service}/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${options.credentials.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(options.expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  if (options.credentials.sessionToken) {
    params["X-Amz-Security-Token"] = options.credentials.sessionToken;
  }

  const canonicalQuery = canonicalQueryString(params);
  const canonicalRequest = [
    "GET",
    options.url.pathname,
    canonicalQuery,
    `host:${options.url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(signingKey(options.credentials.secretAccessKey, dateStamp, options.region, service), stringToSign);
  const signedUrl = new URL(options.url.toString());
  signedUrl.search = `${canonicalQuery}&X-Amz-Signature=${encodeRfc3986(signature)}`;
  return signedUrl.toString();
}

export function publicUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeS3Key(key)}`;
}

function canonicalHeaders(headers: Record<string, string>, signedHeaders: string[]): string {
  return signedHeaders.map((name) => `${name}:${headers[name]?.trim().replace(/\s+/g, " ") ?? ""}\n`).join("");
}

function canonicalQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key] ?? "")}`)
    .join("&");
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmacBuffer(dateKey, region);
  const dateRegionServiceKey = hmacBuffer(dateRegionKey, service);
  return hmacBuffer(dateRegionServiceKey, "aws4_request");
}

function hmacBuffer(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
