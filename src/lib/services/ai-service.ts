// Core AI service for Printer with advanced capabilities
import OpenAI from "openai";

import { log } from "@/lib/utils/logger";

import {
  AIAgent,
  AIOperation,
  AIRequest,
  AIResponse,
  TokenUsage,
} from "../types/ai";

import { estimateCost, recordAICost } from "./cost-monitor";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Available AI models with their configurations
export const AI_MODELS = {
  "gpt-4o": {
    name: "gpt-4o",
    provider: "openai" as const,
    maxTokens: 128000,
    costPerInputToken: 2.5 / 1000000,
    costPerOutputToken: 10.0 / 1000000,
    capabilities: ["text", "vision", "function_calling"],
    contextWindow: 128000,
  },
  "gpt-4o-mini": {
    name: "gpt-4o-mini",
    provider: "openai" as const,
    maxTokens: 128000,
    costPerInputToken: 0.15 / 1000000,
    costPerOutputToken: 0.6 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 128000,
  },
  "gpt-4-turbo": {
    name: "gpt-4-turbo",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 10.0 / 1000000,
    costPerOutputToken: 30.0 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 128000,
  },
  "gpt-3.5-turbo": {
    name: "gpt-3.5-turbo",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 0.5 / 1000000,
    costPerOutputToken: 1.5 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 16385,
  },
};

export class AIService {
  private cache = new Map<string, AIResponse>();
  private requestHistory = new Map<string, AIRequest[]>();

  /**
   * Generate AI response using an agent
   */
  async generateResponse(
    agent: AIAgent,
    request: AIRequest,
    operation: AIOperation
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(agent, request);
      const cachedResponse = this.cache.get(cacheKey);

      if (cachedResponse && this.isCacheValid(cachedResponse)) {
        log.info(
          `🎯 Cache hit for request ${request.id}`,
          undefined,
          "AIService"
        );
        return {
          ...cachedResponse,
          isCached: true,
          processingTime: Date.now() - startTime,
        };
      }

      // Estimate cost before making request
      const estimatedInputTokens = this.estimateTokens(request.prompt);
      const estimatedOutputTokens = Math.min(agent.maxTokens, 2000); // Conservative estimate
      const estimatedCost = estimateCost(
        agent.model.name,
        estimatedInputTokens,
        estimatedOutputTokens
      );

      log.info(
        `💰 Estimated cost: $${estimatedCost.toFixed(4)} for ${operation}`,
        undefined,
        "AIService"
      );

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        log.warn(
          "OpenAI API key not configured, using mock response",
          { operation, agentId: agent.id, agentName: agent.name },
          "AIService"
        );

        // Return operation-specific mock response
        let mockResponse: any;

        if (operation === "portfolio_generation") {
          mockResponse = {
            portfolio_summary:
              "This is a mock portfolio generated for testing purposes. The AI service is not configured with an OpenAI API key.",
            risk_management:
              "Mock risk management: Diversify across sectors, maintain 20% cash allocation, set stop losses at 10% below entry.",
            positions: [
              {
                symbol: "AAPL",
                side: "buy",
                position_side: "long",
                quantity: 100,
                status: "draft",
                rationale:
                  "Mock position: Apple represents strong fundamentals and market leadership in technology sector.",
                confidence: "high",
                target_price: 200,
                stop_loss: 150,
                time_horizon: "12 months",
              },
              {
                symbol: "MSFT",
                side: "buy",
                position_side: "long",
                quantity: 75,
                status: "draft",
                rationale:
                  "Mock position: Microsoft's cloud business and AI integration provide long-term growth potential.",
                confidence: "medium",
                target_price: 450,
                stop_loss: 350,
                time_horizon: "18 months",
              },
            ],
          };
        } else {
          // Generic mock response for other operations
          mockResponse = {
            message: "This is a simple JSON response.",
          };
        }

        const content = JSON.stringify(mockResponse);
        const tokensUsed: TokenUsage = {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        };

        const response: AIResponse = {
          id: this.generateId(),
          requestId: request.id,
          content,
          model: agent.model.name,
          tokensUsed,
          cost: 0,
          timestamp: new Date(),
          isCached: false,
          processingTime: Date.now() - startTime,
          metadata: {
            agentId: agent.id,
            operation,
            temperature: agent.temperature,
            isMockResponse: true,
          },
        };

        log.success(
          `Mock AI response generated: ${tokensUsed.totalTokens} tokens`,
          undefined,
          "AIService"
        );
        return response;
      }

      // Make API request
      const completion = await openai.chat.completions.create({
        model: agent.model.name,
        messages: [
          {
            role: "system",
            content: agent.systemPrompt,
          },
          {
            role: "user",
            content: request.prompt,
          },
        ],
        max_tokens: agent.maxTokens,
        temperature: agent.temperature,
        response_format: { type: "json_object" }, // Force structured output
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content returned from AI model");
      }

      // Parse token usage
      const tokensUsed: TokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      };

      // Calculate actual cost
      const actualCost = this.calculateCost(agent.model.name, tokensUsed);

      // Create response
      const response: AIResponse = {
        id: this.generateId(),
        requestId: request.id,
        content,
        model: agent.model.name,
        tokensUsed,
        cost: actualCost,
        timestamp: new Date(),
        isCached: false,
        processingTime: Date.now() - startTime,
        metadata: {
          agentId: agent.id,
          operation,
          temperature: agent.temperature,
        },
      };

      // Record cost
      recordAICost(
        operation,
        agent.id,
        agent.model.name,
        tokensUsed,
        request.userId,
        request.sessionId,
        {
          requestId: request.id,
          processingTime: response.processingTime,
        }
      );

      // Cache response
      this.cache.set(cacheKey, response);

      // Store request history
      this.addToHistory(request);

      log.success(
        `AI response generated: ${
          tokensUsed.totalTokens
        } tokens, $${actualCost.toFixed(4)}`,
        undefined,
        "AIService"
      );

      return response;
    } catch (error) {
      log.failure("AI service error", error, "AIService");

      // Return error response
      return {
        id: this.generateId(),
        requestId: request.id,
        content: JSON.stringify({ error: "Failed to generate AI response" }),
        model: agent.model.name,
        tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        cost: 0,
        timestamp: new Date(),
        isCached: false,
        processingTime: Date.now() - startTime,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
          agentId: agent.id,
          operation,
        },
      };
    }
  }

  /**
   * Generate multiple responses in parallel (for agent teams)
   */
  async generateMultipleResponses(
    agents: AIAgent[],
    request: AIRequest,
    operation: AIOperation
  ): Promise<AIResponse[]> {
    const promises = agents.map((agent) =>
      this.generateResponse(agent, request, operation)
    );

    return Promise.all(promises);
  }

  /**
   * Generate structured response with validation
   */
  async generateStructuredResponse<T>(
    agent: AIAgent,
    request: AIRequest,
    operation: AIOperation,
    schema: Record<string, unknown>
  ): Promise<AIResponse & { parsedData?: T }> {
    const response = await this.generateResponse(agent, request, operation);

    try {
      const parsedData = JSON.parse(response.content) as T;
      return { ...response, parsedData };
    } catch (error) {
      log.failure("Failed to parse structured response", error, "AIService");
      return response;
    }
  }

  /**
   * Get cached response if available
   */
  getCachedResponse(agent: AIAgent, request: AIRequest): AIResponse | null {
    const cacheKey = this.generateCacheKey(agent, request);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    return null;
  }

  /**
   * Clear cache for specific agent or all cache
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      // Clear cache entries for specific agent
      for (const [key, response] of this.cache.entries()) {
        if (response.metadata?.agentId === agentId) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }

    log.info(
      `🧹 Cache cleared for ${agentId || "all agents"}`,
      undefined,
      "AIService"
    );
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const totalEntries = this.cache.size;
    const hitRate = 0; // TODO: Implement hit rate tracking
    const memoryUsage = 0; // TODO: Implement memory usage tracking

    return { totalEntries, hitRate, memoryUsage };
  }

  /**
   * Get request history for an agent
   */
  getRequestHistory(agentId: string): AIRequest[] {
    return this.requestHistory.get(agentId) || [];
  }

  // Private helper methods

  private generateCacheKey(agent: AIAgent, request: AIRequest): string {
    const promptHash = this.hashString(request.prompt);
    const contextHash = request.context
      ? this.hashString(JSON.stringify(request.context))
      : "no-context";
    return `${agent.id}:${promptHash}:${contextHash}`;
  }

  private isCacheValid(response: AIResponse): boolean {
    // Cache valid for 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return response.timestamp.getTime() > oneHourAgo;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  private calculateCost(modelName: string, tokensUsed: TokenUsage): number {
    const model = AI_MODELS[modelName as keyof typeof AI_MODELS];
    if (!model) return 0;

    const inputCost = tokensUsed.promptTokens * model.costPerInputToken;
    const outputCost = tokensUsed.completionTokens * model.costPerOutputToken;

    return inputCost + outputCost;
  }

  private generateId(): string {
    return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private addToHistory(request: AIRequest): void {
    const history = this.requestHistory.get(request.agentId) || [];
    history.push(request);

    // Keep only last 100 requests per agent
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.requestHistory.set(request.agentId, history);
  }
}

// Global AI service instance
export const aiService = new AIService();

// Helper function to create AI request
export function createAIRequest(
  agentId: string,
  prompt: string,
  context?: Record<string, unknown>,
  userId?: string,
  sessionId?: string
): AIRequest {
  return {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    agentId,
    prompt,
    context,
    timestamp: new Date(),
    userId,
    sessionId,
  };
}

export default aiService;
