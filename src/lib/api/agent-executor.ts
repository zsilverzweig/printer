// Simple agent execution utility for single-agent operations
import { AIAgent, aiService, createAIRequest } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";

import { AgentContext } from "./agent-middleware";

/**
 * Enhanced job interface that includes metadata for simplified execution
 */
export interface JobWithMetadata<TInput = any, TOutput = any> {
  prompt: (input: TInput) => string;
  inputSchema?: (input: any) => TInput;
  outputSchema?: (output: any) => TOutput;
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
 * This is a utility for simple single-agent operations
 *
 * Can be called in multiple ways:
 * 1. executeAgentJob(context, options, input) - original interface
 * 2. executeAgentJob(jobWithMetadata, context, input) - ultra-simplified interface
 * 3. executeAgentJob(jobConfig, context, input) - with explicit config
 */
export async function executeAgentJob<TInput, TOutput>(
  contextOrJob:
    | AgentContext
    | JobWithMetadata<TInput, TOutput>
    | JobConfig<TInput, TOutput>,
  optionsOrContext: AgentExecutionOptions<TInput, TOutput> | AgentContext,
  input?: any
): Promise<TOutput> {
  // Check if this is the ultra-simplified interface with job metadata (jobWithMetadata, context, input)
  if (
    contextOrJob &&
    typeof contextOrJob === "object" &&
    "_agent" in contextOrJob &&
    "_jobName" in contextOrJob
  ) {
    const jobWithMetadata = contextOrJob as JobWithMetadata<TInput, TOutput>;
    const context = optionsOrContext as AgentContext;
    const jobInput = input;

    return executeAgentJobInternal<TInput, TOutput>(
      context,
      jobWithMetadata._agent,
      jobWithMetadata._jobName,
      jobWithMetadata.inputSchema,
      jobWithMetadata.outputSchema,
      jobInput
    );
  }

  // Check if this is the simplified interface (jobConfig, context, input)
  if (
    contextOrJob &&
    typeof contextOrJob === "object" &&
    "prompt" in contextOrJob &&
    "agent" in contextOrJob
  ) {
    const jobConfig = contextOrJob as JobConfig<TInput, TOutput>;
    const context = optionsOrContext as AgentContext;
    const jobInput = input;

    return executeAgentJobInternal<TInput, TOutput>(
      context,
      jobConfig.agent,
      jobConfig.jobName,
      jobConfig.inputSchema,
      jobConfig.outputSchema,
      jobInput
    );
  }

  // Original interface (context, options, input)
  const context = contextOrJob as AgentContext;
  const options = optionsOrContext as AgentExecutionOptions<TInput, TOutput>;

  return executeAgentJobInternal<TInput, TOutput>(
    context,
    options.agent,
    options.jobName,
    options.inputValidator,
    options.outputValidator,
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

  // Validate input if validator provided
  let validatedInput: TInput;
  if (inputValidator) {
    try {
      validatedInput = inputValidator(input);
    } catch (validationError) {
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : "Invalid input";
      throw new Error(errorMessage);
    }
  } else {
    validatedInput = input as TInput;
  }

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

  // Validate output if validator provided
  let validatedOutput: TOutput;
  if (outputValidator) {
    try {
      validatedOutput = outputValidator(rawResult);
    } catch (validationError) {
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : "Invalid output";
      log.error("AI output validation failed", { rawResult }, context.logger);
      throw new Error(errorMessage);
    }
  } else {
    validatedOutput = rawResult as TOutput;
  }

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
