import { NextRequest, NextResponse } from "next/server";

import { PortfolioManagerAgent } from "@/features/agents/portfolio-manager";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";

export const POST = withAgentMiddleware(
  { logger: "RefineThesisAPI" },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();

    // Execute the agent job
    const result = await executeAgentJob(
      {
        agent: PortfolioManagerAgent,
        jobName: "refineThesis",
        prompt: PortfolioManagerAgent.jobs.refineThesis.prompt,
        inputSchema: PortfolioManagerAgent.jobs.refineThesis.inputSchema,
        outputSchema: PortfolioManagerAgent.jobs.refineThesis.outputSchema,
      },
      context,
      body
    );

    return NextResponse.json(result);
  }
);
