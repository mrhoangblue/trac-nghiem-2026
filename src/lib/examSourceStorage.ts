import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deleteFromR2, downloadFromR2, uploadToR2 } from "@/lib/r2Storage";

export interface ExamRawLatex {
  part1: string;
  part2: string;
  part3: string;
}

export interface ExamSourceReference {
  key: string;
  size: number;
  sha256: string;
  version: 1;
  encrypted: true;
  updatedAt: string;
}

interface EncryptedEnvelope {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
}

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

function normalizeEncryptionSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const unquoted = (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) ? trimmed.slice(1, -1) : trimmed;
  return unquoted.replace(/\\n/g, "\n").replace(/\r/g, "");
}

function encryptionKey(): Buffer {
  const secret =
    normalizeEncryptionSecret(process.env.EXAM_SOURCE_ENCRYPTION_KEY) ||
    normalizeEncryptionSecret(process.env.R2_SECRET_ACCESS_KEY) ||
    normalizeEncryptionSecret(process.env.FIREBASE_PRIVATE_KEY);
  if (!secret) throw new Error("EXAM_SOURCE_ENCRYPTION_KEY_MISSING");
  return createHash("sha256").update(secret).digest();
}

export function normalizeRawLatex(value: unknown): ExamRawLatex | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const normalized = {
    part1: typeof source.part1 === "string" ? source.part1 : "",
    part2: typeof source.part2 === "string" ? source.part2 : "",
    part3: typeof source.part3 === "string" ? source.part3 : "",
  };
  return normalized.part1 || normalized.part2 || normalized.part3 ? normalized : null;
}

function encryptSource(source: ExamRawLatex): { bytes: Uint8Array; size: number; sha256: string } {
  const plaintext = Buffer.from(JSON.stringify(source), "utf8");
  if (plaintext.byteLength > MAX_SOURCE_BYTES) throw new Error("EXAM_SOURCE_TOO_LARGE");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return {
    bytes: new TextEncoder().encode(JSON.stringify(envelope)),
    size: plaintext.byteLength,
    sha256: createHash("sha256").update(plaintext).digest("hex"),
  };
}

function decryptSource(bytes: Uint8Array): ExamRawLatex {
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as Partial<EncryptedEnvelope>;
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "aes-256-gcm" ||
    !envelope.iv ||
    !envelope.authTag ||
    !envelope.ciphertext
  ) {
    throw new Error("EXAM_SOURCE_INVALID");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  const source = normalizeRawLatex(JSON.parse(plaintext.toString("utf8")));
  if (!source) throw new Error("EXAM_SOURCE_EMPTY");
  return source;
}

export async function storeExamSource(input: {
  examId: string;
  rawLatex: ExamRawLatex;
  uploadedBy: string;
}): Promise<ExamSourceReference> {
  const encrypted = encryptSource(input.rawLatex);
  const uploaded = await uploadToR2({
    body: encrypted.bytes,
    contentType: "application/octet-stream",
    fileName: `${input.examId}-latex-source.json.enc`,
    folder: "exam-sources",
    metadata: {
      examId: input.examId,
      uploadedBy: input.uploadedBy,
      encrypted: "aes-256-gcm",
    },
  });
  return {
    key: uploaded.key,
    size: encrypted.size,
    sha256: encrypted.sha256,
    version: 1,
    encrypted: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadExamSource(reference: unknown): Promise<ExamRawLatex> {
  if (!reference || typeof reference !== "object") throw new Error("EXAM_SOURCE_REFERENCE_INVALID");
  const key = String((reference as { key?: unknown }).key ?? "");
  if (!key.startsWith("exam-sources/") || key.includes("..")) {
    throw new Error("EXAM_SOURCE_REFERENCE_INVALID");
  }
  return decryptSource(await downloadFromR2(key));
}

export async function deleteExamSource(reference: unknown): Promise<void> {
  const key = typeof reference === "string"
    ? reference
    : String((reference as { key?: unknown } | null)?.key ?? "");
  if (!key.startsWith("exam-sources/") || key.includes("..")) return;
  await deleteFromR2(key);
}
