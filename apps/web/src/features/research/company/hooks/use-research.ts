import { useCallback, useState } from "react";

import { ResearchCompanyInput } from "@/features/agents/research-analyst";
import { useResearchContext } from "../providers/research-provider";
import {
  CompanyResearchResult,
  ResearchService,
} from "../services/research-service";

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
  const { selectedResearch, clearResearch } = useResearchContext();

  const researchCompany = useCallback(async (input: ResearchCompanyInput) => {
    setLoading(true);
    setError(null);

    try {
      await ResearchService.researchCompany(input);
      // The provider subscription will surface the new/updated research
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to research company"
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
