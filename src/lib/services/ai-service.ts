// Core AI service for Printer - focused on execution, cost monitoring, and caching
import OpenAI from "openai";

import { AI_MODELS } from "@/lib/models/ai-models";
import { log } from "@/lib/utils/logger";

import { estimateCost, recordAICost } from "./cost-monitor";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentJob<TInput = any, TOutput = any> {
  name: string;
  description: string;
  prompt: (input: TInput) => string;
  inputType: TInput; // Type marker for input structure
  outputType: TOutput; // Type marker for output structure
  validate?: (input: any) => void; // Optional lightweight validation (just throws if invalid)
  statusMessage?: string; // User feedback message for this job
}

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: (typeof AI_MODELS)[keyof typeof AI_MODELS];
  jobs: Record<string, AgentJob>;
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
    request: AIRequest
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
      const estimatedOutputTokens = Math.min(agent.model.maxTokens, 2000);

      const estimatedCost = estimateCost(
        agent.model.name,
        estimatedInputTokens,
        estimatedOutputTokens
      );

      log.info(
        `💰 Estimated cost: $${estimatedCost.toFixed(4)}`,
        undefined,
        "AIService"
      );

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        log.warn(
          "OpenAI API key not configured, using mock response",
          undefined,
          "AIService"
        );
        return this.createMockResponse(agent, request, startTime);
      }

      // Make OpenAI API request
      log.info(
        "Making OpenAI API request",
        {
          model: agent.model.name,
          maxTokens: agent.model.maxTokens || 2000,
          temperature: (agent.model as any).temperature || 0.2,
        },
        "AIService"
      );

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
        max_tokens: agent.model.maxTokens || 2000,
        temperature: (agent.model as any).temperature || 0.2,
        response_format: { type: "json_object" },
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
          temperature: agent.model.temperature,
        },
      };

      // Record cost
      recordAICost(
        "thesis_generation",
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

      log.success(
        `AI response generated: ${
          tokensUsed.totalTokens
        } tokens, $${actualCost.toFixed(4)}`,
        undefined,
        "AIService"
      );

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
    log.info(
      `🧹 Cache cleared for ${agentId || "all agents"}`,
      undefined,
      "AIService"
    );
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

  private calculateCost(
    modelName: string,
    tokensUsed: AIResponse["tokensUsed"]
  ): number {
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
    startTime: number
  ): AIResponse {
    const mockContent = JSON.stringify({
      message: "This is a mock response - OpenAI API key not configured",
      agentId: agent.id,
    });

    return {
      id: this.generateId(),
      requestId: request.id,
      content: mockContent,
      model: agent.model.name,
      tokensUsed: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
      cost: 0,
      timestamp: new Date(),
      isCached: false,
      processingTime: Date.now() - startTime,
      metadata: {
        agentId: agent.id,
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
  userId: string
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
