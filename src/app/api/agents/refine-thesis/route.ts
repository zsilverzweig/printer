import { NextRequest, NextResponse } from "next/server";

import { withAgentMiddleware, AgentContext } from "@/lib/api/agent-middleware";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { PortfolioManagerAgent, RefineThesisInput, RefineThesisOutput } from "@/features/agents/portfolio-manager";

export const POST = withAgentMiddleware(
  { logger: 'RefineThesisAPI' },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();
    
    // Execute the agent job
    const result = await executeAgentJob<RefineThesisInput, RefineThesisOutput>(
      context,
      {
        agent: PortfolioManagerAgent,
        jobName: 'refineThesis',
        operation: 'thesis_generation',
        inputValidator: PortfolioManagerAgent.jobs.refineThesis.inputSchema,
        outputValidator: PortfolioManagerAgent.jobs.refineThesis.outputSchema
      },
      body
    );

    return NextResponse.json(result);
  }
);
