"use client";

import { useCallback, useState } from "react";

import { useAuthContext } from "@/lib/providers/auth-provider";
import { log } from "@/lib/utils/logger";

export interface AlpacaConnectionStatus {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  alpacaUserId?: string;
  alpacaEmail?: string;
}

export function useAlpacaOAuth() {
  const { user } = useAuthContext();
  const [status, setStatus] = useState<AlpacaConnectionStatus>({
    isConnected: false,
    isLoading: false,
    error: null,
  });

  const connectAccount = useCallback(
    async (environment?: "paper" | "live") => {
      if (!user?.uid) {
        setStatus((prev) => ({ ...prev, error: "User not authenticated" }));
        return;
      }

      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        log.debug(
          "Initiating Alpaca OAuth connection",
          { userId: user.uid },
          "useAlpacaOAuth"
        );

        // Get authorization URL from API
        const url = new URL(
          "/api/alpaca/oauth/authorize",
          window.location.origin
        );
        url.searchParams.set("userId", user.uid);
        if (environment) {
          url.searchParams.set("environment", environment);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
          let errorMessage = "Failed to get authorization URL";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            // If response is not JSON, use the status text
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const { authUrl } = await response.json();

        // Redirect to Alpaca authorization page
        window.location.href = authUrl;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        log.failure(
          "Failed to initiate Alpaca OAuth connection",
          { error: errorMessage, userId: user.uid },
          "useAlpacaOAuth"
        );

        setStatus((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }
    },
    [user?.uid]
  );

  const disconnectAccount = useCallback(async () => {
    if (!user?.uid) {
      setStatus((prev) => ({ ...prev, error: "User not authenticated" }));
      return;
    }

    setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      log.debug(
        "Disconnecting Alpaca account",
        { userId: user.uid },
        "useAlpacaOAuth"
      );

      // TODO: Implement disconnect API call
      // This would revoke the tokens and remove the connection from your database

      setStatus((prev) => ({
        ...prev,
        isConnected: false,
        isLoading: false,
        alpacaUserId: undefined,
        alpacaEmail: undefined,
      }));

      log.success(
        "Successfully disconnected Alpaca account",
        { userId: user.uid },
        "useAlpacaOAuth"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.failure(
        "Failed to disconnect Alpaca account",
        { error: errorMessage, userId: user.uid },
        "useAlpacaOAuth"
      );

      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [user?.uid]);

  const checkConnectionStatus = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setStatus((prev) => ({ ...prev, isLoading: true }));

    try {
      log.debug(
        "Checking Alpaca connection status",
        { userId: user.uid },
        "useAlpacaOAuth"
      );

      // TODO: Implement API call to check if user has connected Alpaca account
      // This would check your database for stored OAuth tokens

      // For now, return a mock status
      setStatus((prev) => ({
        ...prev,
        isConnected: false, // This should come from your database
        isLoading: false,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.failure(
        "Failed to check Alpaca connection status",
        { error: errorMessage, userId: user.uid },
        "useAlpacaOAuth"
      );

      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [user?.uid]);

  return {
    ...status,
    connectAccount,
    disconnectAccount,
    checkConnectionStatus,
  };
}
