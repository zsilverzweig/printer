// React hook for managing portfolios

import { useCallback, useEffect, useState } from "react";

import { log } from "@/lib/utils/logger";

import {
  CreatePortfolioRequest,
  Portfolio,
  UpdatePortfolioRequest,
  UsePortfoliosReturn,
} from "../types";

export function usePortfolios(userId: string): UsePortfoliosReturn {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    if (userId) {
      loadPortfolios();
    }
  }, [userId]);

  const loadPortfolios = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/portfolios?userId=${userId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch portfolios");
      }

      const data = await response.json();
      setPortfolios(data.portfolios);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load portfolios";
      setError(errorMessage);
      log.failure("Failed to load portfolios", err, "usePortfolios");
    } finally {
      setLoading(false);
    }
  };

  const createPortfolio = useCallback(
    async (request: CreatePortfolioRequest): Promise<Portfolio> => {
      try {
        setError(null);
        const response = await fetch("/api/portfolios", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error("Failed to create portfolio");
        }

        const data = await response.json();
        const newPortfolio = data.portfolio;
        setPortfolios((prev) => [...prev, newPortfolio]);
        log.success(
          `Portfolio created: ${newPortfolio.name}`,
          undefined,
          "usePortfolios"
        );
        return newPortfolio;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create portfolio";
        setError(errorMessage);
        log.failure("Failed to create portfolio", err, "usePortfolios");
        throw err;
      }
    },
    []
  );

  const updatePortfolio = useCallback(
    async (
      portfolioId: string,
      request: UpdatePortfolioRequest
    ): Promise<Portfolio> => {
      try {
        setError(null);
        const response = await fetch(`/api/portfolios/${portfolioId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error("Failed to update portfolio");
        }

        const data = await response.json();
        const updatedPortfolio = data.portfolio;
        setPortfolios((prev) =>
          prev.map((portfolio) =>
            portfolio.id === portfolioId ? updatedPortfolio : portfolio
          )
        );
        log.success(
          `Portfolio updated: ${updatedPortfolio.name}`,
          undefined,
          "usePortfolios"
        );
        return updatedPortfolio;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update portfolio";
        setError(errorMessage);
        log.failure("Failed to update portfolio", err, "usePortfolios");
        throw err;
      }
    },
    []
  );

  const deletePortfolio = useCallback(
    async (portfolioId: string): Promise<void> => {
      try {
        setError(null);
        const response = await fetch(`/api/portfolios/${portfolioId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete portfolio");
        }

        setPortfolios((prev) =>
          prev.filter((portfolio) => portfolio.id !== portfolioId)
        );
        log.success(
          `Portfolio deleted: ${portfolioId}`,
          undefined,
          "usePortfolios"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete portfolio";
        setError(errorMessage);
        log.failure("Failed to delete portfolio", err, "usePortfolios");
        throw err;
      }
    },
    []
  );

  const assignAgent = useCallback(
    async (portfolioId: string, agentId: string): Promise<void> => {
      try {
        setError(null);
        // For now, we'll handle agent assignment through the update portfolio API
        // TODO: Create dedicated assign/unassign API endpoints
        const portfolio = portfolios.find((p) => p.id === portfolioId);
        if (!portfolio) throw new Error("Portfolio not found");

        const updatedAgentIds = [
          ...portfolio.assignedAgents.map((a) => a.agentId),
          agentId,
        ];
        await updatePortfolio(portfolioId, {
          assignedAgentIds: updatedAgentIds,
        });

        log.success(
          `Agent ${agentId} assigned to portfolio ${portfolioId}`,
          undefined,
          "usePortfolios"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to assign agent";
        setError(errorMessage);
        log.failure("Failed to assign agent", err, "usePortfolios");
        throw err;
      }
    },
    [portfolios, updatePortfolio]
  );

  const unassignAgent = useCallback(
    async (portfolioId: string, agentId: string): Promise<void> => {
      try {
        setError(null);
        // For now, we'll handle agent unassignment through the update portfolio API
        // TODO: Create dedicated assign/unassign API endpoints
        const portfolio = portfolios.find((p) => p.id === portfolioId);
        if (!portfolio) throw new Error("Portfolio not found");

        const updatedAgentIds = portfolio.assignedAgents
          .filter((a) => a.agentId !== agentId)
          .map((a) => a.agentId);
        await updatePortfolio(portfolioId, {
          assignedAgentIds: updatedAgentIds,
        });

        log.success(
          `Agent ${agentId} unassigned from portfolio ${portfolioId}`,
          undefined,
          "usePortfolios"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to unassign agent";
        setError(errorMessage);
        log.failure("Failed to unassign agent", err, "usePortfolios");
        throw err;
      }
    },
    [portfolios, updatePortfolio]
  );

  return {
    portfolios,
    loading,
    error,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    assignAgent,
    unassignAgent,
  };
}
