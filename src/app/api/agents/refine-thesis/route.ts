import { createAgentHandler } from "@/lib/api/agent-handler";
import { PortfolioManagerAgent, RefineThesisInput, RefineThesisOutput } from "@/features/agents/portfolio-manager";

export const POST = createAgentHandler<RefineThesisInput, RefineThesisOutput>({
  agent: PortfolioManagerAgent,
  jobName: 'refineThesis',
  operation: 'thesis_generation',
  logger: 'RefineThesisAPI'
});
