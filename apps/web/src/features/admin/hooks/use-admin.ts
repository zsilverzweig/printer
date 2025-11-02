// React hook for admin functionality
"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuthContext } from "@/lib/providers/auth-provider";
import { log } from "@/lib/utils/logger";

import type { AdminConfig, UseAdminReturn } from "../types";

export function useAdmin(): UseAdminReturn {
  const { user, isAdmin } = useAuthContext();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load admin data when user changes
  useEffect(() => {
    if (!isAdmin || !user) {
      setConfig(null);
      setUsers([]);
      setLoading(false);
      return;
    }

    loadAdminData();
  }, [isAdmin, user]);

  const loadAdminData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Config is now minimal with no waitlist-specific data
      setConfig({
        id: "main",
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: user.uid,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load admin data";
      setError(errorMessage);
      log.error("Failed to load admin data", err, "useAdmin");
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = useCallback(
    async (updates: Partial<AdminConfig>) => {
      if (!user) {
        throw new Error("User must be authenticated to update config");
      }

      try {
        setLoading(true);
        setError(null);

        // Config updates no longer needed without waitlist
        await loadAdminData(); // Reload data
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update config";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  return {
    config,
    users,
    loading,
    error,
    updateConfig,
  };
}
