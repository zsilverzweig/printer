import { NextRequest, NextResponse } from "next/server";

import { withAgentMiddleware, AgentContext } from "@/lib/api/agent-middleware";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { ResearchAnalystAgent, ResearchCompanyInput, ResearchCompanyOutput } from "@/features/agents/research-analyst";

export const POST = withAgentMiddleware(
  { logger: 'ResearchCompanyAPI' },
  async (request: NextRequest, context: AgentContext) => {
    const body = await request.json();

    // Execute the research analyst job
    const result = await executeAgentJob<ResearchCompanyInput, ResearchCompanyOutput>(
      context,
      {
        agent: ResearchAnalystAgent,
        jobName: 'researchCompany',
        operation: 'company_research',
        inputValidator: ResearchAnalystAgent.jobs.researchCompany.inputSchema,
        outputValidator: ResearchAnalystAgent.jobs.researchCompany.outputSchema
      },
      body
    );

    return NextResponse.json(result);
  }
);
