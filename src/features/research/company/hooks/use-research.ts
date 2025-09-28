import { useState, useCallback } from "react";

import { ResearchService, CompanyResearchResult } from "../services/research-service";
import { ResearchCompanyInput } from "@/features/agents/research-analyst";

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
  const [result, setResult] = useState<CompanyResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const researchCompany = useCallback(async (input: ResearchCompanyInput) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const researchResult = await ResearchService.researchCompany(input);
      setResult(researchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to research company");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    researchCompany,
    clearResult,
    clearError,
  };
}
