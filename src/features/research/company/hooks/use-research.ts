import { useState, useCallback } from "react";

import { ResearchService, CompanyResearchResult } from "../services/research-service";
import { ResearchCompanyInput } from "@/features/agents/research-analyst";
import { useResearchContext } from "../providers/research-provider";

export interface UseResearchReturn {
  // Data
  result: CompanyResearchResult | null;
  
  // Loading states
  loading: boolean;
  
  // Error handling
  error: string | null;
  
  // Actions
  researchCompany: (input: ResearchCompanyInput) => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
}

export function useResearch(): UseResearchReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get data from provider context
  const { selectedResearch, addResearchResult, clearResearch, userId } = useResearchContext();

  const researchCompany = useCallback(async (input: ResearchCompanyInput) => {
    setLoading(true);
    setError(null);

    try {
      const researchResult = await ResearchService.researchCompany(input, userId);
      
      // Add to provider context
      addResearchResult(researchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to research company");
    } finally {
      setLoading(false);
    }
  }, [addResearchResult, userId]);

  const clearResult = useCallback(() => {
    clearResearch();
  }, [clearResearch]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    result: selectedResearch,
    loading,
    error,
    researchCompany,
    clearResult,
    clearError,
  };
}
