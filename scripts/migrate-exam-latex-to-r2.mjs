import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, initializeFirestore } from "firebase-admin/firestore";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const apply = process.argv.includes("--apply");

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizePrivateKey(value) {
  const unquoted = (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) ? value.slice(1, -1) : value;
  return unquoted.replace(/\\n/g, "\n").replace(/\r/g, "");
}

function normalizeEncryptionSecret(value) {
  if (!value) return undefined;
  return normalizePrivateKey(value.trim());
}

function normalizeRawLatex(value) {
  if (!value || typeof value !== "object") return null;
  const source = {
    part1: typeof value.part1 === "string" ? value.part1 : "",
    part2: typeof value.part2 === "string" ? value.part2 : "",
    part3: typeof value.part3 === "string" ? value.part3 : "",
  };
  return source.part1 || source.part2 || source.part3 ? source : null;
}

function sourceEncryptionKey() {
  const secret = normalizeEncryptionSecret(process.env.EXAM_SOURCE_ENCRYPTION_KEY);
  if (!secret) throw new Error("Missing source encryption secret");
  return createHash("sha256").update(secret).digest();
}

function encryptedPayload(source) {
  const plaintext = Buffer.from(JSON.stringify(source), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sourceEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return {
    body: Buffer.from(JSON.stringify(envelope), "utf8"),
    size: plaintext.byteLength,
    sha256: createHash("sha256").update(plaintext).digest("hex"),
  };
}

async function verifyStoredSource(key, expectedSha256) {
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`Empty R2 object after upload: ${key}`);
  const envelope = JSON.parse(await response.Body.transformToString("utf8"));
  if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
    throw new Error(`Invalid encrypted envelope after upload: ${key}`);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    sourceEncryptionKey(),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  const actualSha256 = createHash("sha256").update(plaintext).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error(`R2 checksum mismatch: ${key}`);
}

const app = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId: env("FIREBASE_PROJECT_ID"),
    clientEmail: env("FIREBASE_CLIENT_EMAIL"),
    privateKey: normalizePrivateKey(env("FIREBASE_PRIVATE_KEY")),
  }),
});
const db = initializeFirestore(app, { preferRest: true });
const bucket = env("R2_BUCKET_NAME");
const endpoint = `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  },
});

const snapshot = await db.collection("exams").get();
const candidates = snapshot.docs.flatMap((document) => {
  const data = document.data();
  const rawLatex = normalizeRawLatex(data.rawLatex);
  if (!rawLatex || !Array.isArray(data.questions) || data.questions.length === 0) return [];
  return [{ document, data, rawLatex }];
});
const totalBytes = candidates.reduce(
  (sum, item) => sum + Buffer.byteLength(JSON.stringify(item.rawLatex), "utf8"),
  0,
);

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  scanned: snapshot.size,
  candidates: candidates.length,
  plaintextBytes: totalBytes,
}, null, 2));

if (!apply) {
  console.log("Dry run only. Re-run with --apply after the compatible application version is deployed.");
  process.exit(0);
}

let migrated = 0;
for (const { document, data, rawLatex } of candidates) {
  const encrypted = encryptedPayload(rawLatex);
  const date = new Date().toISOString().slice(0, 10);
  const key = `exam-sources/${date}/${randomUUID()}-${document.id}-latex-source.json.enc`;
  const previousKey = typeof data.rawLatexSource?.key === "string"
    ? data.rawLatexSource.key
    : null;
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: encrypted.body,
    ContentType: "application/octet-stream",
    Metadata: {
      examid: document.id,
      encrypted: "aes-256-gcm",
      migration: "firestore-rawlatex-v1",
    },
  }));
  try {
    await verifyStoredSource(key, encrypted.sha256);
    await document.ref.update({
      rawLatexSource: {
        key,
        size: encrypted.size,
        sha256: encrypted.sha256,
        version: 1,
        encrypted: true,
        updatedAt: new Date().toISOString(),
      },
      rawLatex: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    migrated += 1;
    if (previousKey?.startsWith("exam-sources/") && previousKey !== key) {
      await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: previousKey })).catch((error) => {
        console.warn(`Could not delete previous R2 source for ${document.id}:`, error?.message ?? error);
      });
    }
  } catch (error) {
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    throw error;
  }
}

console.log(JSON.stringify({ migrated, skipped: snapshot.size - candidates.length }, null, 2));
