import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const R2_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const;

export interface R2Status {
  configured: boolean;
  publicAccessConfigured: boolean;
  missing: string[];
  bucket: string | null;
}

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
}

export type R2ObjectFolder = "exam-imports" | "exam-assets" | "exam-sources" | "learning-materials" | "course-assets" | "tikz-renders";

let cachedClient: S3Client | null = null;

function cleanEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) ? trimmed.slice(1, -1).trim() : trimmed;
}

function cleanBaseUrl(value: string | undefined): string | undefined {
  const trimmed = cleanEnvValue(value)?.replace(/\/+$/, "");
  return trimmed || undefined;
}

function s3Endpoint(accountId: string): string {
  const defaultEndpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const configured = cleanBaseUrl(process.env.R2_ENDPOINT);
  if (!configured) return defaultEndpoint;
  try {
    const parsed = new URL(configured);
    return parsed.protocol === "https:" && parsed.hostname === `${accountId}.r2.cloudflarestorage.com`
      ? configured
      : defaultEndpoint;
  } catch {
    return defaultEndpoint;
  }
}

function getConfig(): R2Config | null {
  const missing = R2_ENV_KEYS.filter((key) => !cleanEnvValue(process.env[key]));
  if (missing.length > 0) return null;

  const accountId = cleanEnvValue(process.env.R2_ACCOUNT_ID)!;
  return {
    endpoint: s3Endpoint(accountId),
    accessKeyId: cleanEnvValue(process.env.R2_ACCESS_KEY_ID)!,
    secretAccessKey: cleanEnvValue(process.env.R2_SECRET_ACCESS_KEY)!,
    bucket: cleanEnvValue(process.env.R2_BUCKET_NAME)!,
    publicBaseUrl: cleanBaseUrl(process.env.R2_PUBLIC_BASE_URL),
  };
}

export function getR2Status(): R2Status {
  const missing = R2_ENV_KEYS.filter((key) => !cleanEnvValue(process.env[key]));
  return {
    configured: missing.length === 0,
    publicAccessConfigured: Boolean(cleanBaseUrl(process.env.R2_PUBLIC_BASE_URL)),
    missing,
    bucket: cleanEnvValue(process.env.R2_BUCKET_NAME) || null,
  };
}

function getClient(config: R2Config): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return cachedClient;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return safe.replace(/^[-.]+|[-.]+$/g, "") || "file";
}

function createObjectKey(
  folder: R2ObjectFolder,
  fileName: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${folder}/${date}/${randomUUID()}-${safeFileName(fileName)}`;
}

function publicUrl(config: R2Config, key: string): string | null {
  return config.publicBaseUrl
    ? `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`
    : null;
}

export async function uploadToR2(input: {
  body: Uint8Array | Buffer;
  contentType: string;
  fileName: string;
  folder: R2ObjectFolder;
  objectKey?: string;
  metadata?: Record<string, string>;
}): Promise<{ key: string; url: string | null }> {
  const config = getConfig();
  if (!config) {
    throw new Error("R2_NOT_CONFIGURED");
  }

  const requestedKey = input.objectKey?.trim().replace(/^\/+/, "");
  if (requestedKey && (!requestedKey.startsWith(`${input.folder}/`) || requestedKey.includes(".."))) {
    throw new Error("R2_OBJECT_KEY_INVALID");
  }
  const key = requestedKey || createObjectKey(input.folder, input.fileName);
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType || "application/octet-stream",
      Metadata: input.metadata,
    }),
  );

  return {
    key,
    url: publicUrl(config, key),
  };
}

export async function createR2UploadUrl(input: {
  contentType: string;
  fileName: string;
  folder: R2ObjectFolder;
  metadata?: Record<string, string>;
}): Promise<{ key: string; uploadUrl: string; url: string | null }> {
  const config = getConfig();
  if (!config) throw new Error("R2_NOT_CONFIGURED");
  const key = createObjectKey(input.folder, input.fileName);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: input.contentType || "application/octet-stream",
    Metadata: input.metadata,
  });
  return {
    key,
    uploadUrl: await getSignedUrl(getClient(config), command, { expiresIn: 10 * 60 }),
    url: publicUrl(config, key),
  };
}

export async function downloadFromR2(key: string): Promise<Uint8Array> {
  const config = getConfig();
  if (!config) throw new Error("R2_NOT_CONFIGURED");
  const response = await getClient(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!response.Body) throw new Error("R2_OBJECT_EMPTY");
  return response.Body.transformToByteArray();
}

export async function createR2DownloadUrl(key: string, expiresIn = 10 * 60, inlinePdf = false): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("R2_NOT_CONFIGURED");
  const normalizedKey = key.trim().replace(/^\/+/, "");
  const allowed = ["learning-materials/", "course-assets/", "exam-assets/", "tikz-renders/"]
    .some((prefix) => normalizedKey.startsWith(prefix));
  if (!normalizedKey || !allowed || normalizedKey.includes("..")) {
    throw new Error("R2_OBJECT_KEY_INVALID");
  }
  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: normalizedKey, ...(inlinePdf ? { ResponseContentType: "application/pdf", ResponseContentDisposition: "inline" } : {}) }),
    { expiresIn: Math.max(60, Math.min(expiresIn, 60 * 60)) },
  );
}

export async function getR2ObjectMetadata(key: string): Promise<{
  size: number;
  contentType: string | null;
}> {
  const config = getConfig();
  if (!config) throw new Error("R2_NOT_CONFIGURED");
  const response = await getClient(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  return {
    size: Number(response.ContentLength ?? 0),
    contentType: response.ContentType ?? null,
  };
}

export async function deleteFromR2(key: string): Promise<void> {
  const config = getConfig();
  if (!config) throw new Error("R2_NOT_CONFIGURED");
  const normalizedKey = key.trim().replace(/^\/+/, "");
  const allowedPrefix = ["exam-imports/", "exam-assets/", "exam-sources/", "learning-materials/", "course-assets/", "tikz-renders/"]
    .some((prefix) => normalizedKey.startsWith(prefix));
  if (!normalizedKey || !allowedPrefix) throw new Error("R2_OBJECT_KEY_INVALID");
  await getClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: normalizedKey }));
}
