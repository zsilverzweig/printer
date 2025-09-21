// React hook for managing agent work execution

import { log } from "@/lib/utils/logger";
import { useCallback, useEffect, useState } from "react";
import { AgentWork, UseAgentWorkReturn } from "../types";

export function useAgentWork(portfolioId: string): UseAgentWorkReturn {
  const [workHistory, setWorkHistory] = useState<AgentWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    if (portfolioId) {
      loadWorkHistory();
    }
  }, [portfolioId]);

  const loadWorkHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // For now, return empty array since we don't have a work history API endpoint yet
      // TODO: Implement work history API endpoint
      setWorkHistory([]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load work history";
      setError(errorMessage);
      log.failure("Failed to load work history", err, "useAgentWork");
    } finally {
      setLoading(false);
    }
  };

  const executeWork = useCallback(
    async (portfolioId: string, agentId: string): Promise<AgentWork> => {
      try {
        setError(null);
        const response = await fetch(`/api/portfolios/${portfolioId}/work`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentId }),
        });

        if (!response.ok) {
          throw new Error("Failed to execute work");
        }

        const data = await response.json();
        const newWork = data.work;

        // Add to work history immediately
        setWorkHistory((prev) => [newWork, ...prev]);

        // Poll for updates until completion
        pollWorkStatus(newWork.id);

        log.success(`Work started: ${newWork.id}`, undefined, "useAgentWork");
        return newWork;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to execute work";
        setError(errorMessage);
        log.failure("Failed to execute work", err, "useAgentWork");
        throw err;
      }
    },
    []
  );

  const getWorkStatus = useCallback(
    async (workId: string): Promise<AgentWork> => {
      try {
        setError(null);
        // For now, return a mock work object since we don't have a work status API endpoint yet
        // TODO: Implement work status API endpoint
        const work = workHistory.find((w) => w.id === workId);
        if (!work) throw new Error(`Work ${workId} not found`);

        return work;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get work status";
        setError(errorMessage);
        log.failure("Failed to get work status", err, "useAgentWork");
        throw err;
      }
    },
    [workHistory]
  );

  const cancelWork = useCallback(async (workId: string): Promise<void> => {
    try {
      setError(null);
      // For now, just update the local state since we don't have a cancel work API endpoint yet
      // TODO: Implement cancel work API endpoint
      setWorkHistory((prev) =>
        prev.map((w) =>
          w.id === workId
            ? { ...w, status: "cancelled", completedAt: new Date() }
            : w
        )
      );

      log.success(`Work cancelled: ${workId}`, undefined, "useAgentWork");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel work";
      setError(errorMessage);
      log.failure("Failed to cancel work", err, "useAgentWork");
      throw err;
    }
  }, []);

  // Poll work status until completion
  const pollWorkStatus = useCallback(async (workId: string) => {
    const pollInterval = 2000; // 2 seconds
    const maxPolls = 30; // 1 minute max

    let pollCount = 0;
    const poll = async () => {
      try {
        // For now, just simulate completion after a few polls since we don't have a work status API
        // TODO: Implement proper work status polling with API
        pollCount++;
        if (pollCount >= 3) {
          // Simulate work completion
          setWorkHistory((prev) =>
            prev.map((w) =>
              w.id === workId
                ? { ...w, status: "completed", completedAt: new Date() }
                : w
            )
          );
        } else if (pollCount < maxPolls) {
          setTimeout(poll, pollInterval);
        }
      } catch (err) {
        log.failure(
          `Failed to poll work status for ${workId}`,
          err,
          "useAgentWork"
        );
      }
    };

    // Start polling after a short delay
    setTimeout(poll, pollInterval);
  }, []);

  return {
    workHistory,
    loading,
    error,
    executeWork,
    getWorkStatus,
    cancelWork,
  };
}
