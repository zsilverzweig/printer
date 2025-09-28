// Simple agent execution utility for single-agent operations
import { aiService, createAIRequest, AIAgent, AIOperation } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";

import { AgentContext } from "./agent-middleware";

export interface AgentExecutionOptions<TInput, TOutput> {
  agent: AIAgent;
  jobName: keyof AIAgent['jobs'];
  operation: AIOperation;
  inputValidator?: (input: any) => TInput;
  outputValidator?: (output: any) => TOutput;
}

/**
 * Execute a single agent job with validation
 * This is a utility for simple single-agent operations
 */
export async function executeAgentJob<TInput, TOutput>(
  context: AgentContext,
  options: AgentExecutionOptions<TInput, TOutput>,
  input: any
): Promise<TOutput> {
  const { agent, jobName, operation, inputValidator, outputValidator } = options;
  
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
      const errorMessage = validationError instanceof Error ? validationError.message : "Invalid input";
      throw new Error(errorMessage);
    }
  } else {
    validatedInput = input as TInput;
  }

  log.info("Executing agent job", {
    requestId: context.requestId,
    userId: context.user.uid,
    agentId: agent.id,
    jobName: String(jobName)
  }, context.logger);

  // Create AI request
  const aiRequest = createAIRequest(
    agent.id,
    job.prompt(validatedInput),
    context.user.uid
  );

  // Execute with AI service
  const response = await aiService.generateResponse(agent, aiRequest, operation);
  
  // Parse JSON response
  let rawResult: any;
  try {
    rawResult = JSON.parse(response.content);
  } catch (parseError) {
    log.error("Failed to parse AI response as JSON", { content: response.content }, context.logger);
    throw new Error("AI response is not valid JSON");
  }

  // Validate output if validator provided
  let validatedOutput: TOutput;
  if (outputValidator) {
    try {
      validatedOutput = outputValidator(rawResult);
    } catch (validationError) {
      const errorMessage = validationError instanceof Error ? validationError.message : "Invalid output";
      log.error("AI output validation failed", { rawResult }, context.logger);
      throw new Error(errorMessage);
    }
  } else {
    validatedOutput = rawResult as TOutput;
  }

  log.success("Agent job completed", {
    requestId: context.requestId,
    userId: context.user.uid,
    agentId: agent.id,
    jobName: String(jobName),
    tokensUsed: response.tokensUsed.totalTokens,
    cost: response.cost
  }, context.logger);

  return validatedOutput;
}
