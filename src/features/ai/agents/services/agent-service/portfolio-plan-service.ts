import { aiService, createAIRequest } from "@/lib/services/ai-service"
import { AIAgent } from "@/lib/types/ai"
import { log } from "@/lib/utils/logger"

import {
  Agent,
  Portfolio,
  PortfolioPosition,
  PortfolioPositionStatus,
} from "../../types"
import { PortfolioManagerAgentService } from "./portfolio-manager-agent"

export interface PortfolioManagerPlanPosition {
  symbol?: string
  side?: string
  position_side?: string
  quantity?: number | string
  status?: string
  rationale?: string
  confidence?: string
  target_price?: number | string
  stop_loss?: number | string
  time_horizon?: string
}

export interface PortfolioManagerPlan {
  portfolio_summary?: string
  risk_management?: string
  positions?: PortfolioManagerPlanPosition[]
}

export interface PortfolioPlanResult {
  plan: PortfolioManagerPlan
  positions: PortfolioPosition[]
  raw: string
}

export class PortfolioPlanService {
  constructor(
    private readonly portfolioManagerService: PortfolioManagerAgentService
  ) {}

  async generatePlan(
    portfolio: Portfolio,
    userId: string
  ): Promise<PortfolioPlanResult> {
    const portfolioManager = await this.portfolioManagerService.ensureAgent()
    const aiAgent = this.toAIAgent(portfolioManager)
    const prompt = this.buildPrompt(portfolio.thesis)
    const request = createAIRequest(
      portfolioManager.id,
      prompt,
      {
        thesis: portfolio.thesis,
        portfolioId: portfolio.id,
      },
      userId,
      portfolio.id
    )

    const response = await aiService.generateResponse(
      aiAgent,
      request,
      "portfolio_generation"
    )

    const plan = this.parsePlan(response.content)
    const positions = this.createPositionsFromPlan(plan)

    if (positions.length === 0) {
      log.info(
        "Portfolio Manager returned no positions",
        { portfolioId: portfolio.id },
        "AgentService"
      )
    }

    return { plan, positions, raw: response.content }
  }

  private buildPrompt(thesis: string): string {
    const trimmed = thesis.trim()
    return [
      "Analyze the investment thesis below and convert it into structured, trade-ready positions.",
      "Focus on 3-6 high conviction positions where possible and clearly outline risk controls.",
      "Always produce JSON that conforms to the schema in your workflow.",
      "Thesis:",
      trimmed,
    ].join("\n\n")
  }

  private parsePlan(content: string): PortfolioManagerPlan {
    try {
      const parsed = JSON.parse(content) as PortfolioManagerPlan
      const positions = Array.isArray(parsed.positions)
        ? parsed.positions
        : []
      return {
        portfolio_summary: parsed.portfolio_summary,
        risk_management: parsed.risk_management,
        positions,
      }
    } catch (error) {
      log.failure(
        "Failed to parse Portfolio Manager output",
        error,
        "AgentService"
      )
      return { positions: [] }
    }
  }

  private createPositionsFromPlan(
    plan: PortfolioManagerPlan
  ): PortfolioPosition[] {
    if (!plan.positions || plan.positions.length === 0) {
      return []
    }

    return plan.positions
      .map((position): PortfolioPosition | null => {
        const symbol = (position.symbol ?? "").toUpperCase().trim()
        if (!symbol) {
          return null
        }

        const quantity = Number(position.quantity ?? 0)
        const normalizedQuantity = Number.isFinite(quantity)
          ? Math.max(0, Math.round(quantity))
          : 0

        return {
          id: this.generatePositionId(),
          symbol,
          side: this.normalizeOrderSide(position.side),
          positionSide: this.normalizeExposure(position.position_side),
          quantity: normalizedQuantity,
          status: this.normalizePositionStatus(position.status),
          rationale:
            (position.rationale ?? plan.portfolio_summary ?? "").trim(),
          confidence: this.normalizeConfidence(position.confidence),
          targetPrice: this.toOptionalNumber(position.target_price),
          stopLoss: this.toOptionalNumber(position.stop_loss),
          timeHorizon: position.time_horizon?.trim() || undefined,
          metadata: {
            source: "portfolio_manager",
            raw: position,
          },
        }
      })
      .filter((position): position is PortfolioPosition => Boolean(position))
  }

  private normalizePositionStatus(status?: string): PortfolioPositionStatus {
    if (!status) return "draft"
    const normalized = status.toLowerCase().replace(/[-\s]/g, "_")
    if (normalized === "paper") return "paper"
    if (normalized === "real_money" || normalized === "real" || normalized === "live") {
      return "real_money"
    }
    return "draft"
  }

  private normalizeOrderSide(side?: string): "buy" | "sell" {
    return side && side.toLowerCase().startsWith("sell") ? "sell" : "buy"
  }

  private normalizeExposure(side?: string): "long" | "short" {
    return side && side.toLowerCase().startsWith("short") ? "short" : "long"
  }

  private normalizeConfidence(
    confidence?: string
  ): "low" | "medium" | "high" | undefined {
    if (!confidence) return undefined
    const normalized = confidence.toLowerCase()
    if (["low", "medium", "high"].includes(normalized)) {
      return normalized as "low" | "medium" | "high"
    }
    return undefined
  }

  private toOptionalNumber(value?: number | string): number | undefined {
    if (value === undefined || value === null) return undefined
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : undefined
  }

  private generatePositionId(): string {
    return `position_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
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
    }
  }
}
