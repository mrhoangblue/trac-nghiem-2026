import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore } from "firebase-admin/firestore";

const existingApp = getApps()[0];
let adminApp = existingApp;

function normalizeEnvironmentValue(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let normalized = value.trim();
  const hasMatchingQuotes =
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"));
  if (hasMatchingQuotes) normalized = normalized.slice(1, -1).trim();

  return normalized || undefined;
}

if (!adminApp) {
  // Vercel keeps quotes when a value is pasted from `.env.local`, while the
  // local dotenv loader removes them. Normalize both forms so the exact same
  // service-account values work in local and deployed environments.
  const projectId = normalizeEnvironmentValue(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = normalizeEnvironmentValue(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizeEnvironmentValue(process.env.FIREBASE_PRIVATE_KEY)
    ?.replace(/\\n/g, "\n")
    .replace(/\r/g, "");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY must all be set.",
    );
  }

  adminApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export const adminAuth = getAuth(adminApp);
// REST transport is more stable on local/corporate networks that interrupt
// long-lived HTTP/2 gRPC connections. Server routes do not use snapshots, so
// every operation in this project is supported by the REST transport.
export const adminDb = initializeFirestore(adminApp, { preferRest: true });
