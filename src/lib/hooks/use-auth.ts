// React hook for Firebase authentication
"use client";

import { useEffect, useState } from "react";

import { authService, AuthUser } from "@/lib/services/auth";
import { log } from "@/lib/utils/logger";

export interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  displayName: string;
  photoURL: string | null;
}

export function useAuth(): UseAuthReturn {
  console.log("[PERF] useAuth hook initializing at:", new Date().toISOString());

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log(
      "[PERF] useAuth useEffect starting at:",
      new Date().toISOString()
    );

    // Set initial user state
    const startTime = performance.now();
    const currentUser = authService.getCurrentUser();
    const endTime = performance.now();

    console.log(
      "[PERF] authService.getCurrentUser took:",
      endTime - startTime,
      "ms"
    );
    console.log("[PERF] Current user:", currentUser ? "present" : "null");

    setUser(currentUser);
    setLoading(false);

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange((newUser) => {
      console.log("[PERF] Auth state change callback triggered:", newUser ? 'user present' : 'no user');
      setUser(newUser);
      setLoading(false);
      setError(null);
    });

    console.log("[PERF] useAuth useEffect completed at:", new Date().toISOString());
    return unsubscribe;
  }, []);

  const signInWithGoogle = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await authService.signInWithGoogle();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Sign-in failed";
      setError(errorMessage);
      log.error("Sign-in error", err, "useAuth");
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await authService.signOutUser();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Sign-out failed";
      setError(errorMessage);
      log.error("Sign-out error", err, "useAuth");
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    loading,
    error,
    signInWithGoogle,
    signOut,
    isAuthenticated: authService.isAuthenticated(),
    isAdmin: authService.isAdmin(),
    displayName: authService.getDisplayName(),
    photoURL: authService.getPhotoURL(),
  };
}
