import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore } from "firebase-admin/firestore";

const existingApp = getApps()[0];
let adminApp = existingApp;

if (!adminApp) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

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
