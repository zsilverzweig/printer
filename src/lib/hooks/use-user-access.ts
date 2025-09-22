// React hook for user access management
"use client";

import { useCallback, useEffect, useState } from "react";

import { userService } from "@/lib/services/user-service";
import type { UserAccess } from "@/lib/types/user";
import { log } from "@/lib/utils/logger";

export interface UseUserAccessReturn {
  access: UserAccess | null;
  loading: boolean;
  error: string | null;
  canAccess: (feature: keyof UserAccess) => boolean;
  hasRestriction: (restriction: string) => boolean;
  refreshAccess: () => Promise<void>;
}

export function useUserAccess(uid: string | null): UseUserAccessReturn {
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccess = useCallback(async (userId: string | null) => {
    if (!userId) {
      setAccess(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const accessData = await userService.getUserAccess(userId);
      setAccess(accessData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load access";
      setError(errorMessage);
      log.error("Failed to load user access", err, "useUserAccess");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccess(uid);
  }, [uid, loadAccess]);

  const canAccess = useCallback(
    (feature: keyof UserAccess): boolean => {
      if (!access) return false;

      // Handle boolean features
      if (typeof access[feature] === "boolean") {
        return access[feature] as boolean;
      }

      // Handle restrictions array
      if (feature === "restrictions") {
        return (access[feature] as string[]).length === 0;
      }

      return false;
    },
    [access]
  );

  const hasRestriction = useCallback(
    (restriction: string): boolean => {
      if (!access?.restrictions) return false;
      return access.restrictions.includes(restriction);
    },
    [access]
  );

  const refreshAccess = useCallback(async () => {
    await loadAccess(uid);
  }, [loadAccess, uid]);

  return {
    access,
    loading,
    error,
    canAccess,
    hasRestriction,
    refreshAccess,
  };
}
