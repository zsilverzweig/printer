// Comprehensive user hook that combines authentication with user profile management
"use client";

import { useCallback, useEffect } from "react";

import { useUserAccess } from "@/lib/hooks/use-user-access";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { useAuthContext } from "@/lib/providers/auth-provider";
import type { AuthUser } from "@/lib/services/auth";
import { userService } from "@/lib/services/user-service";
import type { UserAccess, UserProfile, UserStatus } from "@/lib/types/user";
import { log } from "@/lib/utils/logger";

export interface UseUserReturn {
  // Authentication state
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;

  // User profile state
  profile: UserProfile | null;
  access: UserAccess | null;

  // Status checks
  isOnWaitlist: boolean;
  isActive: boolean;
  canAccessApp: boolean;
  canAccessWaitlist: boolean;
  canAccessAdmin: boolean;
  canAccessBetaFeatures: boolean;

  // Actions
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateStatus: (status: UserStatus, reason?: string) => Promise<void>;
  refreshUser: () => Promise<void>;

  // Utility functions
  hasRestriction: (restriction: string) => boolean;
  getDisplayName: () => string;
  getPhotoURL: () => string | null;
}

export function useUser(): UseUserReturn {
  const auth = useAuthContext();

  const {
    profile,
    access,
    error: profileError,
    updateProfile,
    updateStatus,
    refreshProfile,
  } = useUserProfile(auth.user?.uid || null);

  const {
    access: accessData,
    error: accessError,
    hasRestriction,
    refreshAccess,
  } = useUserAccess(auth.user?.uid || null);

  // Initialize user profile when user signs in
  useEffect(() => {
    const initializeUser = async () => {
      if (!auth.user || profile) {
        return;
      }

      try {
        // Check if profile exists, create if not
        let userProfile = await userService.getUserProfile(auth.user.uid);

        if (!userProfile) {
          // Create profile for new user
          userProfile = await userService.createUserProfile(auth.user, {
            signupSource: "google",
            lastActiveAt: new Date(),
            sessionCount: 1,
          });
          log.success(
            "User profile created",
            { uid: auth.user.uid },
            "useUser"
          );
        } else {
          // Update last login for existing user
          await userService.updateLastLogin(auth.user.uid);
        }

        // Refresh profile data
        await refreshProfile();
        await refreshAccess();
      } catch (error) {
        log.error("Failed to initialize user profile", error, "useUser");
      }
    };

    initializeUser();
  }, [auth.user, profile, refreshProfile, refreshAccess]);

  const refreshUser = useCallback(async () => {
    await Promise.all([refreshProfile(), refreshAccess()]);
  }, [refreshProfile, refreshAccess]);

  // Computed values
  const isOnWaitlist = profile?.status === "waitlist" || false;
  const isActive =
    profile?.status === "active" || profile?.status === "invited" || false;
  const canAccessApp = access?.canAccessApp || false;
  const canAccessWaitlist = access?.canAccessWaitlist || false;
  const canAccessAdmin = access?.canAccessAdmin || false;
  const canAccessBetaFeatures = access?.canAccessBetaFeatures || false;

  const getDisplayName = useCallback((): string => {
    if (!auth.user) return "Guest";
    return (
      profile?.displayName || auth.user.displayName || auth.user.email || "User"
    );
  }, [auth.user, profile]);

  const getPhotoURL = useCallback((): string | null => {
    return profile?.photoURL || auth.user?.photoURL || null;
  }, [profile, auth.user]);

  // Simplified loading logic - only show loading during initial auth check
  const shouldShowLoading = auth.loading;

  return {
    // Authentication state
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isAdmin: auth.isAdmin,
    loading: shouldShowLoading,
    error: auth.error || profileError || accessError,

    // User profile state
    profile,
    access: access || accessData,

    // Status checks
    isOnWaitlist,
    isActive,
    canAccessApp,
    canAccessWaitlist,
    canAccessAdmin,
    canAccessBetaFeatures,

    // Actions
    signInWithGoogle: auth.signInWithGoogle,
    signOut: auth.signOut,
    updateProfile,
    updateStatus,
    refreshUser,

    // Utility functions
    hasRestriction,
    getDisplayName,
    getPhotoURL,
  };
}
