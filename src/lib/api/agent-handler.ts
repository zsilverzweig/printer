// Generic agent API handler that eliminates boilerplate
import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";
import { aiService, createAIRequest, AIAgent, AIOperation } from "@/lib/services/ai-service";
import { withSecurity, aiRequestSecurity } from "@/lib/services/security-wrapper";

export interface AgentRouteConfig<TInput, TOutput> {
  agent: AIAgent;
  jobName: keyof AIAgent['jobs'];
  operation: AIOperation;
  logger: string;
}

/**
 * Generic agent handler that handles all the common patterns:
 * - Authentication
 * - Input validation (using job's inputSchema)
 * - AI execution
 * - Output validation (using job's outputSchema)
 * - Error handling
 * - Logging
 */
export function createAgentHandler<TInput, TOutput>(
  config: AgentRouteConfig<TInput, TOutput>
) {
  return withSecurity(aiRequestSecurity, async (request: NextRequest) => {
    try {
      const body = await request.json();
      
      // Get authenticated user
      const user = await getServerUser();
      if (!user) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }

      // Get the job configuration
      const job = config.agent.jobs[config.jobName];
      if (!job) {
        return NextResponse.json(
          { error: `Job '${String(config.jobName)}' not found` },
          { status: 400 }
        );
      }

      // Validate input using job's inputSchema
      let validatedInput: TInput;
      try {
        validatedInput = job.inputSchema ? job.inputSchema(body) : body;
      } catch (validationError) {
        const errorMessage = validationError instanceof Error ? validationError.message : "Invalid input";
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      log.info("Agent request", {
        userId: user.uid,
        agentId: config.agent.id,
        jobName: String(config.jobName)
      }, config.logger);

      // Create AI request
      const aiRequest = createAIRequest(
        config.agent.id,
        job.prompt(validatedInput),
        user.uid
      );

      // Execute with AI service
      const response = await aiService.generateResponse(
        config.agent, 
        aiRequest, 
        config.operation
      );
      
      // Parse JSON response
      let rawResult: any;
      try {
        rawResult = JSON.parse(response.content);
      } catch (parseError) {
        log.error("Failed to parse AI response as JSON", { content: response.content }, config.logger);
        return NextResponse.json(
          { error: "AI response is not valid JSON" },
          { status: 500 }
        );
      }

      // Validate output using job's outputSchema
      let validatedOutput: TOutput;
      try {
        validatedOutput = job.outputSchema ? job.outputSchema(rawResult) : rawResult;
      } catch (validationError) {
        const errorMessage = validationError instanceof Error ? validationError.message : "Invalid output";
        log.error("AI output validation failed", { rawResult }, config.logger);
        return NextResponse.json(
          { error: errorMessage },
          { status: 500 }
        );
      }

      log.success("Agent request completed", {
        userId: user.uid,
        agentId: config.agent.id,
        jobName: String(config.jobName),
        tokensUsed: response.tokensUsed.totalTokens,
        cost: response.cost
      }, config.logger);

      return NextResponse.json(validatedOutput);
    } catch (error) {
      log.error("Agent request failed", error, config.logger);
      return NextResponse.json(
        { error: "Request failed" },
        { status: 500 }
      );
    }
  });
}
