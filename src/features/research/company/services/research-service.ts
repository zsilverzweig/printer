import { ResearchCompanyInput } from "@/features/agents/research-analyst";
import { log } from "@/lib/utils/logger";

export interface CompanyResearchResult {
  id: string;
  ticker: string;
  companyName: string;
  report: string;
  summary: string;
  recommendation: string;
  createdAt: Date;
  updatedAt?: Date;
  status?: string;
  isComplete?: boolean;
  userId?: string;
}

export class ResearchService {
  /**
   * Start comprehensive CRU research workflow via server API.
   * The server writes the document; UI updates via Firestore subscription.
   */
  static async researchCompany(
    input: ResearchCompanyInput,
    _userId?: string
  ): Promise<{ researchId: string }> {
    try {
      log.info(
        "Starting CRU company research",
        {
          companyTicker: input.companyTicker,
          researchFocus: input.researchFocus,
          additionalContext: input.additionalContext,
        },
        "ResearchService"
      );

      const response = await fetch("/api/agents/research-company", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyTicker: input.companyTicker,
          companyName: input.companyTicker,
          investmentThesis: input.additionalContext?.investmentThesis,
          // model overrides can be added from UI later if needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start company research");
      }

      const result: { researchId: string; success: boolean } =
        await response.json();

      log.success(
        "CRU company research started",
        { researchId: result.researchId },
        "ResearchService"
      );

      return { researchId: result.researchId };
    } catch (error) {
      log.error(
        "Failed to start CRU company research",
        error,
        "ResearchService"
      );
      throw error;
    }
  }
}
