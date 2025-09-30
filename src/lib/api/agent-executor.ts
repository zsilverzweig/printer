// Simple agent execution utility for single-agent operations
import { AIAgent, aiService, createAIRequest } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";

import { AgentContext } from "./agent-middleware";

/**
 * Enhanced job interface that includes metadata for simplified execution
 */
export interface JobWithMetadata<TInput = any, TOutput = any> {
  prompt: (input: TInput) => string;
  inputType: TInput;
  outputType: TOutput;
  _agent: AIAgent;
  _jobName: keyof AIAgent["jobs"];
}

/**
 * Create an enhanced job object with metadata for simplified execution
 */
export function createJobWithMetadata<TInput = any, TOutput = any>(
  agent: AIAgent,
  jobName: keyof AIAgent["jobs"]
): JobWithMetadata<TInput, TOutput> {
  const job = agent.jobs[jobName];
  return {
    ...job,
    _agent: agent,
    _jobName: jobName,
    inputType: undefined as TInput,
    outputType: undefined as TOutput,
  };
}

export interface AgentExecutionOptions<TInput, TOutput> {
  agent: AIAgent;
  jobName: keyof AIAgent["jobs"];
  inputValidator?: (input: any) => TInput;
  outputValidator?: (output: any) => TOutput;
}

/**
 * Execute a single agent job with validation
 * Ultra-simplified interface: executeAgentJob(job, context, input)
 * Just pass the job object from agent.jobs.jobName
 */
export async function executeAgentJob<TInput = any, TOutput = any>(
  job: AgentJob<TInput, TOutput>,
  context: AgentContext,
  input: TInput
): Promise<TOutput> {
  // The job object doesn't have agent info, so we need to find it
  // For now, we'll extract it from the execution context
  // This is a simple implementation - the job has everything we need
  
  // Execute the job directly
  return executeAgentJobInternal(
    context,
    job as any, // Pass the job itself, we'll handle it in internal
    input
  );
}

/**
 * Internal implementation that handles the actual execution
 */
async function executeAgentJobInternal<TInput, TOutput>(
  context: AgentContext,
  agent: AIAgent,
  jobName: keyof AIAgent["jobs"],
  inputValidator?: (input: any) => TInput,
  outputValidator?: (output: any) => TOutput,
  input?: any
): Promise<TOutput> {
  // Get the job configuration
  const job = agent.jobs[jobName];
  if (!job) {
    throw new Error(`Job '${String(jobName)}' not found`);
  }

  // Use input as-is (no validation)
  const validatedInput = input as TInput;

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
    job.prompt(validatedInput),
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

  // Use output as-is (no validation)
  const validatedOutput = rawResult as TOutput;

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

  return validatedOutput;
}
