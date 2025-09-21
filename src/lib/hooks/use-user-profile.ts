// React hook for user profile management
"use client";

import { userService } from "@/lib/services/user-service";
import type { UserAccess, UserProfile, UserStatus } from "@/lib/types/user";
import { log } from "@/lib/utils/logger";
import { useCallback, useEffect, useState } from "react";

export interface UseUserProfileReturn {
  profile: UserProfile | null;
  access: UserAccess | null;
  loading: boolean;
  error: string | null;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateStatus: (status: UserStatus, reason?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useUserProfile(uid: string | null): UseUserProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!uid) {
      setProfile(null);
      setAccess(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [profileData, accessData] = await Promise.all([
        userService.getUserProfile(uid),
        userService.getUserAccess(uid),
      ]);

      setProfile(profileData);
      setAccess(accessData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load profile";
      setError(errorMessage);
      log.error("Failed to load user profile", err, "useUserProfile");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!uid) {
        throw new Error("No user ID provided");
      }

      try {
        setError(null);
        await userService.updateUserProfile(uid, updates);

        // Refresh profile data
        await loadProfile();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update profile";
        setError(errorMessage);
        log.error("Failed to update user profile", err, "useUserProfile");
        throw err;
      }
    },
    [uid, loadProfile]
  );

  const updateStatus = useCallback(
    async (status: UserStatus, reason?: string) => {
      if (!uid) {
        throw new Error("No user ID provided");
      }

      try {
        setError(null);
        await userService.updateUserStatus(uid, status, reason);

        // Refresh profile data
        await loadProfile();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update status";
        setError(errorMessage);
        log.error("Failed to update user status", err, "useUserProfile");
        throw err;
      }
    },
    [uid, loadProfile]
  );

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  return {
    profile,
    access,
    loading,
    error,
    updateProfile,
    updateStatus,
    refreshProfile,
  };
}
