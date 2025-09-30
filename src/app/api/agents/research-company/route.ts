import { NextRequest, NextResponse } from "next/server";

import {
  GetCurrentNewsOutput,
  ResearchAnalystAgent,
  ResearchCompanyOutput,
  SynthesizeInformationOutput,
} from "@/features/agents/research-analyst";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";

export const POST = withAgentMiddleware(
  { logger: "ResearchCompanyAPI" },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();

    // Execute the research analyst job
    const result = await executeAgentJob(
      ResearchAnalystAgent,
      "researchCompany",
      context,
      {
        ...body,
        user_id: context.user.uid,
      }
    );

    return NextResponse.json(result);
  }
);

// New comprehensive research workflow endpoint
export const PUT = withAgentMiddleware(
  { logger: "ComprehensiveResearchAPI" },
  async (
    request: NextRequest,
    context: AgentContext
  ): Promise<
    NextResponse<
      | {
          research: ResearchCompanyOutput;
          news: GetCurrentNewsOutput;
          synthesis: SynthesizeInformationOutput;
          workflow: {
            completedSteps: number;
            totalSteps: number;
            status: string;
          };
        }
      | { error: string }
    >
  > => {
    const body = await request.json();
    const { companyTicker, companyName, investmentThesis } = body;

    if (
      !companyTicker ||
      typeof companyTicker !== "string" ||
      !companyTicker.trim()
    ) {
      return NextResponse.json(
        { error: "Company ticker is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    try {
      // Step 1: Research Company
      const researchResult = await executeAgentJob(
        ResearchAnalystAgent,
        "researchCompany",
        context,
        {
          companyTicker,
          companyName,
          user_id: context.user.uid,
        }
      );

      // Step 2: Get Current News
      const newsResult = await executeAgentJob(
        ResearchAnalystAgent,
        "getCurrentNews",
        context,
        {
          companyTicker,
          companyName,
          existingResearch: researchResult.report,
          newsTimeframe: "30_days",
          user_id: context.user.uid,
        }
      );

      // Step 3: Synthesize Information
      const synthesisResult = await executeAgentJob(
        ResearchAnalystAgent,
        "synthesizeInformation",
        context,
        {
          companyTicker,
          companyName,
          researchData: researchResult.report,
          newsData: newsResult.newsSummary,
          investmentThesis,
          user_id: context.user.uid,
        }
      );

      return NextResponse.json({
        research: researchResult,
        news: newsResult,
        synthesis: synthesisResult,
        workflow: {
          completedSteps: 3,
          totalSteps: 3,
          status: "completed",
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }
);
