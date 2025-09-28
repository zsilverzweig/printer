// Single hook for all portfolio operations - orchestrates service + provider
import { useCallback, useState } from "react";

import { usePortfolioContext } from "../providers/portfolio-provider";
import { PortfolioService } from "../services/portfolio-service";
import { CreatePortfolioRequest, Portfolio, UpdatePortfolioRequest } from "../types";

export interface UsePortfolioReturn {
  // Data from provider
  portfolios: Portfolio[];
  selectedPortfolio: Portfolio | null;
  
  // Loading states
  loading: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  
  // Error handling
  error: string | null;
  
  // Actions
  createPortfolio: (request: CreatePortfolioRequest) => Promise<Portfolio>;
  updatePortfolio: (portfolioId: string, updates: UpdatePortfolioRequest) => Promise<void>;
  deletePortfolio: (portfolioId: string) => Promise<void>;
  
  // UI state
  selectPortfolio: (portfolio: Portfolio | null) => void;
  refreshPortfolios: () => void;
}

export function usePortfolio(_userId: string): UsePortfolioReturn {
  // Get data from provider
  const { portfolios, selectedPortfolio, loading, error, selectPortfolio, refreshPortfolios } = usePortfolioContext();
  
  // Local loading states for actions
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Basic CRUD operations using PortfolioService
  const createPortfolio = useCallback(
    async (request: CreatePortfolioRequest): Promise<Portfolio> => {
      try {
        setCreating(true);
        setActionError(null);
        return await PortfolioService.createPortfolio(request);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to create portfolio";
        setActionError(errorMessage);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    []
  );

  const updatePortfolio = useCallback(
    async (portfolioId: string, updates: UpdatePortfolioRequest): Promise<void> => {
      try {
        setUpdating(true);
        setActionError(null);
        await PortfolioService.updatePortfolio(portfolioId, updates);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update portfolio";
        setActionError(errorMessage);
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
        await PortfolioService.deletePortfolio(portfolioId);
        
        // Clear selection if deleted portfolio was selected
        if (selectedPortfolio?.id === portfolioId) {
          selectPortfolio(null);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to delete portfolio";
        setActionError(errorMessage);
        throw err;
      } finally {
        setDeleting(false);
      }
    },
    [selectedPortfolio, selectPortfolio]
  );



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
    updatePortfolio,
    deletePortfolio,
    
    // UI state
    selectPortfolio,
    refreshPortfolios,
  };
}
