import { NextRequest, NextResponse } from "next/server";

import { PortfolioManagerAgent } from "@/features/agents/portfolio-manager";
import {
  createJobWithMetadata,
  executeAgentJob,
} from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";

// Create enhanced job for simplified execution
const CreatePortfolioJob = createJobWithMetadata(
  PortfolioManagerAgent,
  "createPortfolio"
);

export const POST = withAgentMiddleware(
  { logger: "CreatePortfolioAPI" },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();

    // You can add custom business logic here before calling the agent
    // For example: validate user permissions, check quotas, etc.

    // Execute the agent job with simplified interface
    const result = await executeAgentJob(CreatePortfolioJob, context, body);

    // You can add custom business logic here after the agent executes
    // For example: save to database, send notifications, etc.

    return NextResponse.json(result);
  }
);
