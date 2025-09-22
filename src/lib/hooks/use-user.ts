// Comprehensive user hook that combines authentication with user profile management
"use client";

import { useCallback, useEffect, useState } from "react";

import { useUserAccess } from "@/lib/hooks/use-user-access";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { useAuthContext } from "@/lib/providers/auth-provider";
import { userService } from "@/lib/services/user-service";
import type { UserAccess, UserProfile, UserStatus } from "@/lib/types/user";
import { log } from "@/lib/utils/logger";

export interface UseUserReturn {
  // Authentication state
  user: any | null;
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
  console.log("[PERF] useUser hook starting at:", new Date().toISOString());
  
  const auth = useAuthContext();
  console.log("[PERF] useUser auth state:", { 
    isAuthenticated: auth.isAuthenticated, 
    loading: auth.loading,
    user: auth.user ? 'present' : 'null'
  });
  
  const {
    profile,
    access,
    loading: profileLoading,
    error: profileError,
    updateProfile,
    updateStatus,
    refreshProfile,
  } = useUserProfile(auth.user?.uid || null);
  
  console.log("[PERF] useUserProfile state:", { 
    profileLoading, 
    profileError,
    profile: profile ? 'present' : 'null'
  });
  
  const {
    access: accessData,
    loading: accessLoading,
    error: accessError,
    hasRestriction,
    refreshAccess,
  } = useUserAccess(auth.user?.uid || null);
  
  console.log("[PERF] useUserAccess state:", { 
    accessLoading, 
    accessError,
    access: accessData ? 'present' : 'null'
  });
  
  const [initializing, setInitializing] = useState(true);

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log("[PERF] Loading timeout reached, setting initializing to false");
      setInitializing(false);
    }, 5000); // 5 second timeout

    return () => clearTimeout(timeout);
  }, []);

  // Initialize user profile when user signs in
  useEffect(() => {
    const initializeUser = async () => {
      console.log("[PERF] initializeUser called:", { 
        hasUser: !!auth.user, 
        hasProfile: !!profile,
        isAuthenticated: auth.isAuthenticated 
      });
      
      if (!auth.user || profile) {
        console.log("[PERF] Setting initializing to false - no user or profile exists");
        setInitializing(false);
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
      } finally {
        setInitializing(false);
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

  // Don't show loading if user is not authenticated and auth is not loading
  const shouldShowLoading = auth.loading || (auth.isAuthenticated && (profileLoading || accessLoading || initializing));
  
  console.log("[PERF] useUser loading state:", {
    authLoading: auth.loading,
    isAuthenticated: auth.isAuthenticated,
    profileLoading,
    accessLoading,
    initializing,
    shouldShowLoading
  });

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
