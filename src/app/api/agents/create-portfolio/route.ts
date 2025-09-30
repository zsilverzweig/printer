import { NextRequest, NextResponse } from "next/server";

import { PortfolioManagerAgent } from "@/features/agents/portfolio-manager";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";

export const POST = withAgentMiddleware(
  { logger: "CreatePortfolioAPI" },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();

    // You can add custom business logic here before calling the agent
    // For example: validate user permissions, check quotas, etc.

    // Execute the agent job
    const result = await executeAgentJob(
      {
        agent: PortfolioManagerAgent,
        jobName: "createPortfolio",
        prompt: PortfolioManagerAgent.jobs.createPortfolio.prompt,
        inputSchema: PortfolioManagerAgent.jobs.createPortfolio.inputSchema,
        outputSchema: PortfolioManagerAgent.jobs.createPortfolio.outputSchema,
      },
      context,
      body
    );

    // You can add custom business logic here after the agent executes
    // For example: save to database, send notifications, etc.

    return NextResponse.json(result);
  }
);
