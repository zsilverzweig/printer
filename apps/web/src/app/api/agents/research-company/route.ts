import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

import {
  GetCurrentNewsOutput,
  ResearchAnalystAgent,
  ResearchCompanyOutput,
  SynthesizeInformationOutput,
} from "@/features/agents/research-analyst";
import { CompanyResearch } from "@/features/research/company/types";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";
import { COLLECTIONS, db } from "@/lib/services/firebase";
import { companyResearchSecurity } from "@/lib/services/security-wrapper";

export const POST = withAgentMiddleware(
  { logger: "ResearchCompanyAPI" },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();
    const { modelOverride, jobModelOverrides } = body || {};

    // Execute the research analyst job
    const result = await executeAgentJob(
      ResearchAnalystAgent,
      "researchCompany",
      context,
      body,
      { modelOverride: jobModelOverrides?.researchCompany ?? modelOverride }
    );

    return NextResponse.json(result);
  }
);

// Comprehensive research workflow endpoint that creates and updates research in Firebase
export const PUT = withAgentMiddleware(
  {
    logger: "ComprehensiveResearchAPI",
    customSecurity: companyResearchSecurity,
  },
  async (
    request: NextRequest,
    context: AgentContext
  ): Promise<
    NextResponse<{ researchId: string; success: boolean } | { error: string }>
  > => {
    const body = await request.json();
    const {
      companyTicker,
      companyName,
      investmentThesis,
      modelOverride,
      jobModelOverrides,
    } = body;

    if (!companyTicker?.trim()) {
      return NextResponse.json(
        { error: "Company ticker is required" },
        { status: 400 }
      );
    }

    try {
      // Create initial research document
      const researchId = `research_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const research: CompanyResearch = {
        id: researchId,
        userId: context.user.uid,
        companyTicker,
        companyName: companyName || companyTicker,
        background: null,
        recentNews: null,
        synthesis: null,
        recommendation: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status:
          ResearchAnalystAgent.jobs.researchCompany.statusMessage ||
          "Starting research...",
        isComplete: false,
      };

      // Save initial research document
      await setDoc(doc(db, COLLECTIONS.COMPANY_RESEARCH, researchId), research);
      // Step 1: Research Company (Background)
      const researchResult: ResearchCompanyOutput = await executeAgentJob(
        ResearchAnalystAgent,
        "researchCompany",
        context,
        { companyTicker, companyName },
        { modelOverride: jobModelOverrides?.researchCompany ?? modelOverride }
      );

      // Save background to Firebase
      await updateDoc(doc(db, COLLECTIONS.COMPANY_RESEARCH, researchId), {
        background: {
          report: researchResult.report,
          summary: researchResult.summary,
        },
        recommendation: researchResult.recommendation,
        status:
          ResearchAnalystAgent.jobs.getCurrentNews.statusMessage ||
          "Getting current news...",
        updatedAt: serverTimestamp(),
      });

      // Step 2: Get Current News
      const newsResult: GetCurrentNewsOutput = await executeAgentJob(
        ResearchAnalystAgent,
        "getCurrentNews",
        context,
        {
          companyTicker,
          companyName,
          existingResearch: researchResult.report,
          newsTimeframe: "30_days",
        },
        { modelOverride: jobModelOverrides?.getCurrentNews ?? modelOverride }
      );

      // Save recent news to Firebase
      await updateDoc(doc(db, COLLECTIONS.COMPANY_RESEARCH, researchId), {
        recentNews: {
          summary: newsResult.newsSummary,
          keyDevelopments: newsResult.keyDevelopments,
        },
        status:
          ResearchAnalystAgent.jobs.synthesizeInformation.statusMessage ||
          "Synthesizing information...",
        updatedAt: serverTimestamp(),
      });

      // Step 3: Synthesize Information
      const synthesisResult: SynthesizeInformationOutput =
        await executeAgentJob(
          ResearchAnalystAgent,
          "synthesizeInformation",
          context,
          {
            companyTicker,
            companyName,
            researchData: researchResult.report,
            newsData: newsResult.newsSummary,
            investmentThesis,
          },
          {
            modelOverride:
              jobModelOverrides?.synthesizeInformation ?? modelOverride,
          }
        );

      // Save synthesis and mark complete
      await updateDoc(doc(db, COLLECTIONS.COMPANY_RESEARCH, researchId), {
        synthesis: {
          synthesis: synthesisResult.synthesis,
          keyInsights: synthesisResult.keyInsights,
          riskFactors: synthesisResult.riskFactors,
        },
        status: "completed",
        isComplete: true,
        completedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({ researchId, success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }
);
