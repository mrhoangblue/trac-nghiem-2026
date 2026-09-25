import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebaseAdmin";

export interface AuthContextData {
  uid: string;
  email: string;
  role: string;
}

export async function verifyAuth(req: NextRequest): Promise<AuthContextData | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Fetch user profile to get role
    const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
    let role = "student"; // Default role
    if (userDoc.exists) {
      role = userDoc.data()?.role || "student";
    }

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      role: role,
    };
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}
