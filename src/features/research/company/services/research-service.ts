import { log } from "@/lib/utils/logger";
import { ResearchCompanyInput, ResearchCompanyOutput } from "@/features/agents/research-analyst";

export interface CompanyResearchResult {
  id: string;
  ticker: string;
  companyName: string;
  report: string;
  summary: string;
  recommendation: string;
  createdAt: Date;
}

export class ResearchService {
  /**
   * Research a company using the Research Analyst agent
   */
  static async researchCompany(input: ResearchCompanyInput): Promise<CompanyResearchResult> {
    try {
      log.info("Starting company research", { companyTicker: input.companyTicker }, "ResearchService");

      const response = await fetch("/api/agents/research-company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to research company");
      }

      const result: ResearchCompanyOutput = await response.json();
      
      // Create a research result with metadata
      const researchResult: CompanyResearchResult = {
        id: `research_${input.companyTicker}_${Date.now()}`,
        ticker: result.ticker,
        companyName: result.companyName,
        report: result.report,
        summary: result.summary,
        recommendation: result.recommendation,
        createdAt: new Date(),
      };

      log.success("Company research completed", { 
        ticker: result.ticker,
        companyName: result.companyName 
      }, "ResearchService");

      return researchResult;
    } catch (error) {
      log.error("Failed to research company", error, "ResearchService");
      throw error;
    }
  }
}
