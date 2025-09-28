import { doc, setDoc, serverTimestamp } from "firebase/firestore";

import { db, COLLECTIONS } from "@/lib/services/firebase";
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
  userId?: string;
}

export class ResearchService {
  /**
   * Research a company using the Research Analyst agent
   */
  static async researchCompany(input: ResearchCompanyInput, userId?: string): Promise<CompanyResearchResult> {
    try {
      log.info("Starting company research", { 
        companyTicker: input.companyTicker,
        userId: userId || 'unknown',
        researchFocus: input.researchFocus,
        additionalContext: input.additionalContext
      }, "ResearchService");

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
      const researchId = `research_${input.companyTicker}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const researchResult: CompanyResearchResult = {
        id: researchId,
        ticker: result.ticker,
        companyName: result.companyName,
        report: result.report,
        summary: result.summary,
        recommendation: result.recommendation,
        createdAt: new Date(),
        userId: userId,
      };

      // Save research to Firestore
      const metadata: Record<string, any> = {
        generatedByAI: true,
        aiModel: 'research-analyst',
        generatedAt: new Date().toISOString()
      };

      // Only add optional fields if they have values
      if (input.researchFocus && input.researchFocus.length > 0) {
        metadata.researchFocus = input.researchFocus;
      }
      
      if (input.additionalContext && Object.keys(input.additionalContext).length > 0) {
        metadata.additionalContext = input.additionalContext;
      }

      const researchDoc = {
        ...researchResult,
        userId: userId || 'unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        metadata
      };

      log.debug("Saving research to Firestore", { 
        researchId,
        metadata: JSON.stringify(metadata, null, 2)
      }, "ResearchService");

      await setDoc(doc(db, COLLECTIONS.COMPANY_RESEARCH, researchId), researchDoc);

      log.success("Company research completed and saved", { 
        researchId: researchResult.id,
        ticker: result.ticker,
        companyName: result.companyName,
        savedToFirestore: true
      }, "ResearchService");

      return researchResult;
    } catch (error) {
      log.error("Failed to research company", error, "ResearchService");
      throw error;
    }
  }
}
