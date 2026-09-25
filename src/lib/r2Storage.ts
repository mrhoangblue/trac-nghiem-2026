import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

let cachedClient: S3Client | null = null;

function cleanBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || undefined;
}

function getConfig(): R2Config | null {
  const missing = R2_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) return null;

  const accountId = process.env.R2_ACCOUNT_ID!.trim();
  return {
    endpoint:
      cleanBaseUrl(process.env.R2_ENDPOINT) ??
      `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: process.env.R2_BUCKET_NAME!.trim(),
    publicBaseUrl: cleanBaseUrl(process.env.R2_PUBLIC_BASE_URL),
  };
}

export function getR2Status(): R2Status {
  const missing = R2_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  return {
    configured: missing.length === 0,
    publicAccessConfigured: Boolean(cleanBaseUrl(process.env.R2_PUBLIC_BASE_URL)),
    missing,
    bucket: process.env.R2_BUCKET_NAME?.trim() || null,
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
  folder: "exam-imports" | "exam-assets" | "learning-materials",
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
  folder: "exam-imports" | "exam-assets" | "learning-materials";
  metadata?: Record<string, string>;
}): Promise<{ key: string; url: string | null }> {
  const config = getConfig();
  if (!config) {
    throw new Error("R2_NOT_CONFIGURED");
  }

  const key = createObjectKey(input.folder, input.fileName);
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
  folder: "exam-imports" | "learning-materials";
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
