// Simple agent execution utility for single-agent operations
import { AIAgent, aiService, createAIRequest } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";

import { AgentContext } from "./agent-middleware";

/**
 * Execute a single agent job
 * Ultra-simplified interface: executeAgentJob(agent, jobName, context, input)
 */
export async function executeAgentJob<TInput = any, TOutput = any>(
  agent: AIAgent,
  jobName: keyof AIAgent["jobs"],
  context: AgentContext,
  input: TInput
): Promise<TOutput> {
  // Get the job configuration
  const job = agent.jobs[jobName];
  if (!job) {
    throw new Error(`Job '${String(jobName)}' not found`);
  }

  const jobInput = input;

  log.info(
    "Executing agent job",
    {
      requestId: context.requestId,
      userId: context.user.uid,
      agentId: agent.id,
      jobName: String(jobName),
    },
    context.logger
  );

  // Create AI request
  const aiRequest = createAIRequest(
    agent.id,
    job.prompt(jobInput),
    context.user.uid
  );

  // Execute with AI service
  const response = await aiService.generateResponse(agent, aiRequest);

  // Parse JSON response
  let rawResult: any;
  try {
    rawResult = JSON.parse(response.content);
  } catch {
    log.error(
      "Failed to parse AI response as JSON",
      { content: response.content },
      context.logger
    );
    throw new Error("AI response is not valid JSON");
  }

  const output = rawResult as TOutput;

  log.success(
    "Agent job completed",
    {
      requestId: context.requestId,
      userId: context.user.uid,
      agentId: agent.id,
      jobName: String(jobName),
      tokensUsed: response.tokensUsed.totalTokens,
      cost: response.cost,
    },
    context.logger
  );

  return output;
}
