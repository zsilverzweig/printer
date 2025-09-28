// React hook for managing portfolios using the provider context
"use client";

import { useCallback, useState } from "react";

import { log } from "@/lib/utils/logger";

import {
  CreatePortfolioRequestType,
  PortfolioType,
  UpdatePortfolioRequestType,
  UsePortfolioContextReturn,
} from "../types";

import { usePortfolioContext as usePortfolioProvider } from "../providers/portfolio-provider";

export function usePortfolioContext(): UsePortfolioContextReturn {
  const {
    portfolios,
    selectedPortfolio,
    loading,
    error,
    selectPortfolio,
    refreshPortfolios,
  } = usePortfolioProvider();

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const createPortfolio = useCallback(
    async (request: CreatePortfolioRequestType): Promise<PortfolioType> => {
      try {
        setCreating(true);
        setActionError(null);

        const response = await fetch("/api/portfolios", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create portfolio");
        }

        const data = await response.json();
        const newPortfolio = data.portfolio;
        
        log.success(
          `Portfolio created: ${newPortfolio.name}`,
          undefined,
          "usePortfolioContext"
        );
        
        return newPortfolio;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create portfolio";
        setActionError(errorMessage);
        log.error("Failed to create portfolio", err, "usePortfolioContext");
        throw err;
      } finally {
        setCreating(false);
      }
    },
    []
  );

  const createPortfolioDraftFromThesis = useCallback(
    async (
      thesis: string,
      options: { name?: string; description?: string } = {}
    ): Promise<PortfolioType> => {
      try {
        setCreating(true);
        setActionError(null);
        
        const payload = {
          thesis,
          ...(options.name ? { name: options.name } : {}),
          ...(options.description ? { description: options.description } : {}),
        };

        const response = await fetch("/api/portfolios/wizard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create portfolio from thesis");
        }

        const data = await response.json();
        const newPortfolio = data.portfolio;
        
        log.success(
          `Portfolio created from thesis: ${newPortfolio.name}`,
          undefined,
          "usePortfolioContext"
        );
        
        return newPortfolio;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create portfolio from thesis";
        setActionError(errorMessage);
        log.error("Failed to create portfolio from thesis", err, "usePortfolioContext");
        throw err;
      } finally {
        setCreating(false);
      }
    },
    []
  );

  const updatePortfolio = useCallback(
    async (portfolioId: string, updates: UpdatePortfolioRequestType): Promise<void> => {
      try {
        setUpdating(true);
        setActionError(null);

        const response = await fetch(`/api/portfolios/${portfolioId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to update portfolio");
        }

        log.success(
          `Portfolio updated: ${portfolioId}`,
          undefined,
          "usePortfolioContext"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update portfolio";
        setActionError(errorMessage);
        log.error("Failed to update portfolio", err, "usePortfolioContext");
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    []
  );

  const deletePortfolio = useCallback(
    async (portfolioId: string): Promise<void> => {
      try {
        setDeleting(true);
        setActionError(null);

        const response = await fetch(`/api/portfolios/${portfolioId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete portfolio");
        }

        // Clear selection if deleted portfolio was selected
        if (selectedPortfolio?.id === portfolioId) {
          selectPortfolio(null);
        }

        log.success(
          `Portfolio deleted: ${portfolioId}`,
          undefined,
          "usePortfolioContext"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete portfolio";
        setActionError(errorMessage);
        log.error("Failed to delete portfolio", err, "usePortfolioContext");
        throw err;
      } finally {
        setDeleting(false);
      }
    },
    [selectedPortfolio, selectPortfolio]
  );

  const assignAgent = useCallback(
    async (portfolioId: string, agentId: string): Promise<void> => {
      try {
        setActionError(null);
        
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
          "usePortfolioContext"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to assign agent";
        setActionError(errorMessage);
        log.error("Failed to assign agent", err, "usePortfolioContext");
        throw err;
      }
    },
    [portfolios, updatePortfolio]
  );

  const unassignAgent = useCallback(
    async (portfolioId: string, agentId: string): Promise<void> => {
      try {
        setActionError(null);
        
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
          "usePortfolioContext"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to unassign agent";
        setActionError(errorMessage);
        log.error("Failed to unassign agent", err, "usePortfolioContext");
        throw err;
      }
    },
    [portfolios, updatePortfolio]
  );

  const addPortfolio = useCallback((portfolio: PortfolioType): void => {
    // This is handled automatically by the real-time listener
    // But we can keep this for compatibility
    log.info("Portfolio added via real-time listener", { portfolioId: portfolio.id }, "usePortfolioContext");
  }, []);

  return {
    // Data from provider
    portfolios,
    selectedPortfolio,
    
    // Loading states
    loading,
    creating,
    updating,
    deleting,
    
    // Error handling
    error: error || actionError,
    
    // Actions
    createPortfolio,
    createPortfolioDraftFromThesis,
    updatePortfolio,
    deletePortfolio,
    assignAgent,
    unassignAgent,
    addPortfolio,
    
    // UI state
    selectPortfolio,
    refreshPortfolios,
  };
}
