import { NextRequest, NextResponse } from "next/server";

import { PortfolioManagerAgent } from "@/features/agents/portfolio-manager";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";

export const POST = withAgentMiddleware(
  { logger: "RefineThesisAPI" },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();

    // Execute the agent job with simplified interface
    const result = await executeAgentJob(
      PortfolioManagerAgent,
      "refineThesis",
      context,
      body
    );

    return NextResponse.json(result);
  }
);
