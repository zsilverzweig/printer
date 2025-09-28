import { NextRequest, NextResponse } from "next/server";

import { withAgentMiddleware, AgentContext } from "@/lib/api/agent-middleware";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { PortfolioManagerAgent, CreatePortfolioInput, CreatePortfolioOutput } from "@/features/agents/portfolio-manager";

export const POST = withAgentMiddleware(
  { logger: 'CreatePortfolioAPI' },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();
    
    // You can add custom business logic here before calling the agent
    // For example: validate user permissions, check quotas, etc.
    
    // Execute the agent job
    const result = await executeAgentJob<CreatePortfolioInput, CreatePortfolioOutput>(
      context,
      {
        agent: PortfolioManagerAgent,
        jobName: 'createPortfolio',
        operation: 'portfolio_generation',
        inputValidator: PortfolioManagerAgent.jobs.createPortfolio.inputSchema,
        outputValidator: PortfolioManagerAgent.jobs.createPortfolio.outputSchema
      },
      body
    );

    // You can add custom business logic here after the agent executes
    // For example: save to database, send notifications, etc.
    
    return NextResponse.json(result);
  }
);
