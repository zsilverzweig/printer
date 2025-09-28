"use client";

import { useCallback, useMemo } from "react";

import { useCompanyResearch } from "@/features/agents/hooks/use-company-research";
import { CompanyResearchInput } from "@/features/agents/agents/company-research/types/work-types";

import { SimpleResearchResponse } from "../types";

/**
 * Hook that bridges the new agent system with the legacy company research interface
 */
export function useCompanyResearchAgent() {
  const { conductCompanyResearch, isResearching, researchError } = useCompanyResearch();

  const executeCompanyResearch = useCallback(
    async (
      companyTicker: string,
      researchFocus?: string[], // Keep for backward compatibility but ignore
      additionalContext?: Record<string, unknown>,
      userId?: string
    ): Promise<SimpleResearchResponse> => {
      const input: CompanyResearchInput = {
        companyTicker,
        additionalContext,
      };

      const result = await conductCompanyResearch(input);

      // Convert the new output format to the legacy SimpleResearchResponse format
      const response: SimpleResearchResponse = {
        ticker: input.companyTicker,
        companyName: input.companyTicker, // Use ticker as company name fallback
        report: result.research_report,
        summary: result.executive_summary,
        recommendation: "", // No longer provided
      };

      return response;
    },
    [conductCompanyResearch]
  );

  return useMemo(
    () => ({
      executeCompanyResearch,
      isResearching,
      researchError,
    }),
    [executeCompanyResearch, isResearching, researchError]
  );
}
