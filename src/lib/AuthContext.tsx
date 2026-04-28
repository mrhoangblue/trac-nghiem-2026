"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ADMIN_EMAIL = "mrhoangblue@gmail.com";

// Routes that bypass the profile-complete guard
const OPEN_ROUTES = ["/onboarding"];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  school: string;
  role: "admin" | "mod" | "student" | "pending_teacher";
  class?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isMod: boolean;
  /** SAFARI: plain function — must not be async so popup opens inside gesture */
  login: () => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isProfileComplete(data: Partial<UserProfile> | null | undefined): boolean {
  return !!(data?.role && data?.fullName && data?.school);
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-gray-400 text-sm animate-pulse">Đang tải…</p>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Keep a stable ref so route-guard effects always see fresh values
  const stateRef = useRef({ user, userProfile, loading, pathname });
  useEffect(() => {
    stateRef.current = { user, userProfile, loading, pathname };
  });

  // ── Fetch / upsert user profile from Firestore ─────────────────────────────
  const fetchProfile = useCallback(async (firebaseUser: User): Promise<UserProfile | null> => {
    const ref = doc(db, "users", firebaseUser.uid);

    // Admin VIP: ensure role=admin in Firestore then return profile
    if (firebaseUser.email === ADMIN_EMAIL) {
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().role !== "admin") {
        await setDoc(
          ref,
          {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            fullName: firebaseUser.displayName ?? "Admin",
            school: "Royal School",
            role: "admin",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        const updated = await getDoc(ref);
        return (updated.data() as UserProfile) ?? null;
      }
      return snap.data() as UserProfile;
    }

    // Regular user: fetch doc, return null if incomplete
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as UserProfile;
    return isProfileComplete(data) ? data : null;
  }, []);

  // ── Public refreshProfile (called after onboarding submit) ─────────────────
  const refreshProfile = useCallback(async () => {
    const { user: currentUser } = stateRef.current;
    if (!currentUser) return;
    const profile = await fetchProfile(currentUser);
    setUserProfile(profile);
  }, [fetchProfile]);

  // ── Auth state listener ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      const profile = await fetchProfile(firebaseUser);
      setUserProfile(profile);
      setLoading(false);
    });
    return unsub;
  }, [fetchProfile]);

  // ── Route guard: profile incomplete → force /onboarding ───────────────────
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (OPEN_ROUTES.includes(pathname)) return; // already there — don't loop
    if (!userProfile) {
      router.replace("/onboarding");
    }
  }, [loading, user, userProfile, pathname, router]);

  // ── Route guard: profile complete + on /onboarding → redirect home ─────────
  useEffect(() => {
    if (loading) return;
    if (!user || !userProfile) return;
    if (pathname === "/onboarding") {
      router.replace("/");
    }
  }, [loading, user, userProfile, pathname, router]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  /**
   * SAFARI FIX: login MUST be a plain (non-async) function so that
   * signInWithPopup is called synchronously within the user-gesture event
   * handler. Safari's popup blocker kills popups opened after ANY async
   * boundary (even a single microtask from `async/await`).
   *
   * onAuthStateChanged handles the result — no need to await here.
   */
  const login = () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
      // Silently ignore user-cancelled / popup-closed errors
      if (err?.code !== "auth/popup-closed-by-user") {
        console.error("signInWithPopup error:", err);
      }
    });
  };

  const logout = () => {
    signOut(auth).catch((err) => console.error("signOut error:", err));
  };

  const isAdmin = userProfile?.role === "admin";
  const isMod = userProfile?.role === "mod" || userProfile?.role === "admin";

  // Show loading screen while Firebase auth resolves
  if (loading) return <LoadingScreen />;

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, isAdmin, isMod, login, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
