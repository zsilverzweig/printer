// React hook for Firebase authentication
"use client";

import { useEffect, useState } from "react";

import type { ServerUser } from "@/lib/auth/server";
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

export function useAuth(initialUser?: ServerUser | null): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we have an initial user from server-side, use it
    if (initialUser) {
      // Convert ServerUser to AuthUser format
      const authUser: AuthUser = {
        uid: initialUser.uid,
        email: initialUser.email,
        displayName: initialUser.displayName,
        photoURL: initialUser.photoURL,
        emailVerified: true, // Assume verified if from server
        isAnonymous: false,
        metadata: {
          creationTime: undefined,
          lastSignInTime: undefined,
        },
      };
      setUser(authUser);
      setLoading(false);
    } else {
      // Set initial user state from client-side auth
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    }

    // Listen for auth state changes
    const unsubscribe = authService.onAuthStateChange((newUser) => {
      setUser(newUser);
      setLoading(false);
      setError(null);
    });

    return unsubscribe;
  }, [initialUser]);

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
    isAuthenticated: Boolean(user),
    isAdmin: authService.isAdmin(),
    displayName: authService.getDisplayName(),
    photoURL: authService.getPhotoURL(),
  };
}
