// Core AI service for Printer - focused on execution, cost monitoring, and caching
import OpenAI from "openai";

import { log } from "@/lib/utils/logger";
import { estimateCost, recordAICost } from "./cost-monitor";

// ============================================================================
// AI MODELS CONFIGURATION
// ============================================================================

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
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: {
    name: keyof typeof AI_MODELS;
    temperature: number;
    maxTokens: number;
  };
}

export interface AIRequest {
  id: string;
  agentId: string;
  prompt: string;
  userId: string;
  timestamp: Date;
}

export interface AIResponse {
  id: string;
  requestId: string;
  content: string;
  model: string;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  timestamp: Date;
  isCached: boolean;
  processingTime: number;
  metadata: {
    agentId: string;
    operation: string;
    temperature: number;
  };
}

export type AIOperation = 
  | "thesis_generation"
  | "portfolio_generation" 
  | "company_research"
  | "trade_analysis"
  | "risk_assessment"
  | "market_analysis";

// ============================================================================
// AI SERVICE
// ============================================================================

export class AIService {
  private cache = new Map<string, AIResponse>();
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate AI response - core method with cost monitoring and caching
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
        log.info(`🎯 Cache hit for request ${request.id}`, undefined, "AIService");
        return {
          ...cachedResponse,
          isCached: true,
          processingTime: Date.now() - startTime,
        };
      }

      // Estimate cost before making request
      const estimatedInputTokens = this.estimateTokens(request.prompt);
      const estimatedOutputTokens = Math.min(agent.model.maxTokens, 2000);
      
      const estimatedCost = estimateCost(
        agent.model.name,
        estimatedInputTokens,
        estimatedOutputTokens
      );

      log.info(`💰 Estimated cost: $${estimatedCost.toFixed(4)} for ${operation}`, undefined, "AIService");

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        log.warn("OpenAI API key not configured, using mock response", { operation }, "AIService");
        return this.createMockResponse(agent, request, operation, startTime);
      }

      // Make OpenAI API request
      log.info("Making OpenAI API request", {
        model: agent.model.name,
        maxTokens: agent.model.maxTokens,
        temperature: agent.model.temperature,
      }, "AIService");

      const completion = await this.openai.chat.completions.create({
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
        max_tokens: agent.model.maxTokens,
        temperature: agent.model.temperature,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content returned from AI model");
      }

      // Parse token usage
      const tokensUsed = {
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
          temperature: agent.model.temperature,
        },
      };

      // Record cost
      recordAICost(
        operation,
        agent.id,
        agent.model.name,
        tokensUsed,
        request.userId,
        undefined, // sessionId
        {
          requestId: request.id,
          processingTime: response.processingTime,
        }
      );

      // Cache response
      this.cache.set(cacheKey, response);

      log.success(`AI response generated: ${tokensUsed.totalTokens} tokens, $${actualCost.toFixed(4)}`, undefined, "AIService");

      return response;
    } catch (error) {
      log.error("AI service error", error, "AIService");
      
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
          agentId: agent.id,
          operation,
          temperature: agent.model.temperature,
        },
      };
    }
  }

  /**
   * Clear cache for specific agent or all cache
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      for (const [key, response] of this.cache.entries()) {
        if (response.metadata?.agentId === agentId) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
    log.info(`🧹 Cache cleared for ${agentId || "all agents"}`, undefined, "AIService");
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private generateCacheKey(agent: AIAgent, request: AIRequest): string {
    const promptHash = this.hashString(request.prompt);
    return `${agent.id}:${promptHash}`;
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

  private calculateCost(modelName: string, tokensUsed: AIResponse['tokensUsed']): number {
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

  private createMockResponse(
    agent: AIAgent, 
    request: AIRequest, 
    operation: AIOperation, 
    startTime: number
  ): AIResponse {
    const mockContent = JSON.stringify({
      message: "This is a mock response - OpenAI API key not configured",
      operation,
      agentId: agent.id,
    });

    return {
      id: this.generateId(),
      requestId: request.id,
      content: mockContent,
      model: agent.model.name,
      tokensUsed: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      cost: 0,
      timestamp: new Date(),
      isCached: false,
      processingTime: Date.now() - startTime,
      metadata: {
        agentId: agent.id,
        operation,
        temperature: agent.model.temperature,
      },
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Global AI service instance
export const aiService = new AIService();

// Helper function to create AI request
export function createAIRequest(
  agentId: string,
  prompt: string,
  userId: string,
): AIRequest {
  return {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    agentId,
    prompt,
    userId,
    timestamp: new Date(),
  };
}

export default aiService;