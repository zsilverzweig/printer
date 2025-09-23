import { aiService, createAIRequest } from "@/lib/services/ai-service";
import { AIAgent } from "@/lib/types/ai";
import { log } from "@/lib/utils/logger";

import {
  Agent,
  Portfolio,
  PortfolioPosition,
  PortfolioPositionStatus,
} from "../../types";

import { PortfolioManagerAgentService } from "./portfolio-manager-agent";

export interface PortfolioManagerPlanPosition {
  symbol?: string;
  side?: string;
  position_side?: string;
  quantity?: number | string;
  status?: string;
  rationale?: string;
  confidence?: string;
  target_price?: number | string;
  stop_loss?: number | string;
  time_horizon?: string;
}

export interface PortfolioManagerPlan {
  portfolio_summary?: string;
  risk_management?: string;
  positions?: PortfolioManagerPlanPosition[];
}

export interface PortfolioPlanResult {
  plan: PortfolioManagerPlan;
  positions: PortfolioPosition[];
  raw: string;
}

export class PortfolioPlanService {
  constructor(
    private readonly portfolioManagerService: PortfolioManagerAgentService
  ) {}

  async generatePlan(
    portfolio: Portfolio,
    userId: string
  ): Promise<PortfolioPlanResult> {
    const startTime = Date.now();
    const planId = `plan_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 6)}`;

    log.info(
      "Starting portfolio plan generation",
      {
        planId,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        thesisLength: portfolio.thesis.length,
        userId,
      },
      "PortfolioPlanService"
    );

    try {
      // Step 1: Ensure Portfolio Manager agent exists
      log.info(
        "Ensuring Portfolio Manager agent exists",
        { planId },
        "PortfolioPlanService"
      );
      const portfolioManager = await this.portfolioManagerService.ensureAgent();
      log.success(
        "Portfolio Manager agent ready",
        {
          planId,
          agentId: portfolioManager.id,
          agentName: portfolioManager.name,
        },
        "PortfolioPlanService"
      );

      // Step 2: Prepare AI request
      log.info("Preparing AI request", { planId }, "PortfolioPlanService");
      const aiAgent = this.toAIAgent(portfolioManager);
      const prompt = this.buildPrompt(portfolio.thesis);
      const request = createAIRequest(
        portfolioManager.id,
        prompt,
        {
          thesis: portfolio.thesis,
          portfolioId: portfolio.id,
        },
        userId,
        portfolio.id
      );

      log.info(
        "AI request prepared",
        {
          planId,
          promptLength: prompt.length,
          agentModel: aiAgent.model,
          agentTemperature: aiAgent.temperature,
        },
        "PortfolioPlanService"
      );

      // Step 3: Generate AI response
      log.info(
        "Generating AI response",
        {
          planId,
          agentId: aiAgent.id,
          agentName: aiAgent.name,
          promptLength: request.prompt.length,
          promptPreview: request.prompt.substring(0, 200) + "...",
          operation: "portfolio_generation",
        },
        "PortfolioPlanService"
      );

      const response = await aiService.generateResponse(
        aiAgent,
        request,
        "portfolio_generation"
      );

      log.success(
        "AI response generated",
        {
          planId,
          responseLength: response.content.length,
          tokensUsed: response.tokensUsed,
          modelUsed: response.model,
          isMockResponse: response.metadata?.isMockResponse,
          contentPreview:
            response.content.substring(0, 500) +
            (response.content.length > 500 ? "..." : ""),
        },
        "PortfolioPlanService"
      );

      // Step 4: Parse the plan
      log.info("Parsing portfolio plan", { planId }, "PortfolioPlanService");
      const plan = this.parsePlan(response.content);

      log.info(
        "Plan parsed successfully",
        {
          planId,
          hasSummary: !!plan.portfolio_summary,
          hasRiskManagement: !!plan.risk_management,
          positionCount: plan.positions?.length || 0,
        },
        "PortfolioPlanService"
      );

      // Step 5: Create positions from plan
      log.info(
        "Creating positions from plan",
        { planId },
        "PortfolioPlanService"
      );
      const positions = this.createPositionsFromPlan(plan);

      log.success(
        "Positions created",
        {
          planId,
          positionCount: positions.length,
          validPositions: positions.filter((p) => p.symbol && p.quantity > 0)
            .length,
        },
        "PortfolioPlanService"
      );

      if (positions.length === 0) {
        log.warn(
          "Portfolio Manager returned no positions",
          {
            planId,
            portfolioId: portfolio.id,
            rawResponse:
              response.content.substring(0, 500) +
              (response.content.length > 500 ? "..." : ""),
          },
          "PortfolioPlanService"
        );
      }

      const duration = Date.now() - startTime;
      log.success(
        "Portfolio plan generation completed",
        {
          planId,
          duration,
          portfolioId: portfolio.id,
          positionCount: positions.length,
          totalTokens: response.tokensUsed,
        },
        "PortfolioPlanService"
      );

      return { plan, positions, raw: response.content };
    } catch (error) {
      const duration = Date.now() - startTime;
      log.failure(
        "Failed to generate portfolio plan",
        {
          error,
          planId,
          duration,
          portfolioId: portfolio.id,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        "PortfolioPlanService"
      );
      throw error;
    }
  }

  private buildPrompt(thesis: string): string {
    const trimmed = thesis.trim();
    return [
      "Analyze the investment thesis below and convert it into structured, trade-ready positions.",
      "Focus on 3-6 high conviction positions where possible and clearly outline risk controls.",
      "Always produce JSON that conforms to the schema in your workflow.",
      "Thesis:",
      trimmed,
    ].join("\n\n");
  }

  private parsePlan(content: string): PortfolioManagerPlan {
    try {
      log.info(
        "Parsing AI response content",
        {
          contentLength: content.length,
          contentPreview:
            content.substring(0, 200) + (content.length > 200 ? "..." : ""),
        },
        "PortfolioPlanService"
      );

      const parsed = JSON.parse(content) as any;

      // Handle both expected format (positions) and actual format (trades)
      const positions = Array.isArray(parsed.positions)
        ? parsed.positions
        : Array.isArray(parsed.trades)
        ? parsed.trades
        : [];

      // Handle both expected format (risk_management) and actual format (risk_guidance)
      const riskManagement =
        parsed.risk_management || parsed.risk_guidance || "";

      log.info(
        "Plan parsing successful",
        {
          hasSummary: !!parsed.portfolio_summary,
          hasRiskManagement: !!riskManagement,
          rawPositionCount: positions.length,
          validPositionCount: positions.length,
          foundTrades: !!parsed.trades,
          foundPositions: !!parsed.positions,
          foundRiskGuidance: !!parsed.risk_guidance,
          foundRiskManagement: !!parsed.risk_management,
        },
        "PortfolioPlanService"
      );

      return {
        portfolio_summary: parsed.portfolio_summary,
        risk_management: riskManagement,
        positions,
      };
    } catch (error) {
      log.failure(
        "Failed to parse Portfolio Manager output",
        {
          error,
          contentLength: content.length,
          contentPreview:
            content.substring(0, 500) + (content.length > 500 ? "..." : ""),
          errorMessage:
            error instanceof Error ? error.message : "Unknown parsing error",
        },
        "PortfolioPlanService"
      );
      return { positions: [] };
    }
  }

  private createPositionsFromPlan(
    plan: PortfolioManagerPlan
  ): PortfolioPosition[] {
    if (!plan.positions || plan.positions.length === 0) {
      return [];
    }

    return plan.positions
      .map((position): PortfolioPosition | null => {
        // Handle both expected format (symbol) and actual format (ticker)
        const symbol = (position.symbol ?? position.ticker ?? "")
          .toUpperCase()
          .trim();
        if (!symbol) {
          return null;
        }

        const quantity = Number(position.quantity ?? 0);
        const normalizedQuantity = Number.isFinite(quantity)
          ? Math.max(0, Math.round(quantity))
          : 0;

        // Handle both expected format (side) and actual format (action)
        const side = position.side ?? position.action ?? "buy";
        // Handle both expected format (position_side) and actual format (exposure)
        const positionSide =
          position.position_side ?? position.exposure ?? "long";

        return {
          id: this.generatePositionId(),
          symbol,
          side: this.normalizeOrderSide(side),
          positionSide: this.normalizeExposure(positionSide),
          quantity: normalizedQuantity,
          status: this.normalizePositionStatus(position.status),
          rationale: (
            position.rationale ??
            plan.portfolio_summary ??
            ""
          ).trim(),
          confidence: this.normalizeConfidence(position.confidence),
          targetPrice: this.toOptionalNumber(position.target_price),
          stopLoss: this.toOptionalNumber(position.stop_loss),
          timeHorizon: position.time_horizon?.trim() || undefined,
          metadata: {
            source: "portfolio_manager",
            raw: position,
          },
        };
      })
      .filter((position): position is PortfolioPosition => Boolean(position));
  }

  private normalizePositionStatus(status?: string): PortfolioPositionStatus {
    if (!status) return "draft";
    const normalized = status.toLowerCase().replace(/[-\s]/g, "_");
    if (normalized === "paper") return "paper";
    if (
      normalized === "real_money" ||
      normalized === "real" ||
      normalized === "live"
    ) {
      return "real_money";
    }
    return "draft";
  }

  private normalizeOrderSide(side?: string): "buy" | "sell" {
    return side && side.toLowerCase().startsWith("sell") ? "sell" : "buy";
  }

  private normalizeExposure(side?: string): "long" | "short" {
    return side && side.toLowerCase().startsWith("short") ? "short" : "long";
  }

  private normalizeConfidence(
    confidence?: string
  ): "low" | "medium" | "high" | undefined {
    if (!confidence) return undefined;
    const normalized = confidence.toLowerCase();
    if (["low", "medium", "high"].includes(normalized)) {
      return normalized as "low" | "medium" | "high";
    }
    return undefined;
  }

  private toOptionalNumber(value?: number | string): number | undefined {
    if (value === undefined || value === null) return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : undefined;
  }

  private generatePositionId(): string {
    return `position_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private toAIAgent(agent: Agent): AIAgent {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      role: agent.role,
      model: agent.model,
      systemPrompt: agent.promptGuidance,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      version: agent.version,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      isActive: agent.isActive,
      metadata: agent.metadata,
    };
  }
}
