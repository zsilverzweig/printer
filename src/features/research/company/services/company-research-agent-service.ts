/**
 * Company Research Agent Service (New Implementation)
 * 
 * Uses the new agent architecture with typed work capabilities.
 * This service bridges the old interface with the new agent system.
 */

import { CompanyResearchInput } from "@/features/agents/agents/company-research/types/work-types";
import { useCompanyResearch } from "@/features/agents/hooks/use-company-research";
import { log } from "@/lib/utils/logger";


import { SimpleResearchResponse } from "../types";

export class CompanyResearchAgentService {
  private companyResearchHook: ReturnType<typeof useCompanyResearch>;

  constructor() {
    // Note: In a real implementation, we'd need to handle the hook initialization
    // For now, we'll create a service that can be used with the hook
  }

  /**
   * Initialize the service with the company research hook
   */
  initializeWithHook(hook: ReturnType<typeof useCompanyResearch>) {
    this.companyResearchHook = hook;
  }

  async executeCompanyResearch(
    companyTicker: string,
    researchFocus?: string[], // Keep for backward compatibility but ignore
    additionalContext?: Record<string, unknown>,
    userId?: string
  ): Promise<SimpleResearchResponse> {
    try {
      log.info("Starting executeCompanyResearch (new implementation)", {
        companyTicker,
        researchFocus,
        additionalContext,
        userId
      }, "CompanyResearchAgentService");

      if (!this.companyResearchHook) {
        throw new Error("Company research hook not initialized");
      }

      const input: CompanyResearchInput = {
        companyTicker,
        additionalContext,
      };

      const result = await this.companyResearchHook.conductCompanyResearch(input);

      // Convert the new output format to the legacy SimpleResearchResponse format
      const response: SimpleResearchResponse = {
        ticker: input.companyTicker,
        companyName: input.companyTicker, // Use ticker as company name fallback
        report: result.research_report,
        summary: result.executive_summary,
        recommendation: "", // No longer provided
      };

      log.success("Company research completed (new implementation)", {
        companyTicker,
        summaryLength: result.executive_summary.length,
        contentLength: result.research_report.length
      }, "CompanyResearchAgentService");

      return response;
    } catch (error) {
      log.error("Failed to execute company research (new implementation)", error, "CompanyResearchAgentService");
      throw error;
    }
  }
}

export const companyResearchAgentService = new CompanyResearchAgentService();
