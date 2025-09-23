import { AI_MODELS } from "@/lib/services/ai-service"
import { log } from "@/lib/utils/logger"

import { Agent, Workflow, DEFAULT_WORKFLOW } from "../../types"
import { AgentRepository } from "../firestore/agent-repository"

const PORTFOLIO_MANAGER_AGENT_ID = "portfolio-manager-agent"
const PORTFOLIO_MANAGER_NAME = "Portfolio Manager"
const PORTFOLIO_MANAGER_DESCRIPTION =
  "Transforms theses into trade-ready, structured portfolios for Alpaca"

const PORTFOLIO_MANAGER_PROMPT = `You are the Portfolio Manager for Printer. Your mandate is to review an investment thesis and translate it into a structured set of trade instructions that Alpaca can execute. You make the final allocation decisions and must ensure risk controls are well defined.

Always respond with a strict JSON object that matches the provided schema. Do not include any explanatory text outside of the JSON. Every position must include:
- ticker symbol (all caps)
- whether we are buying or selling
- whether the resulting exposure is long or short
- an integer quantity of shares to target
- the status (draft, paper, or real_money)
- a concise rationale summarizing the alignment with the thesis

Whenever status is omitted, default it to "draft" so a human can review before capital is committed. Include portfolio-level summary and risk guidance fields to capture your broader thinking.`

const createPortfolioManagerWorkflow = (): Workflow => {
  const timestamp = new Date()
  return {
    ...DEFAULT_WORKFLOW,
    id: "portfolio-manager-workflow",
    name: "Portfolio Manager Structured Position Workflow",
    description:
      "Analyze the thesis and produce structured, trade-ready positions for execution.",
    steps: DEFAULT_WORKFLOW.steps.map((step) => {
      const clonedStep = {
        ...step,
        dependencies: step.dependencies ? [...step.dependencies] : undefined,
      }

      if (step.id === "response-generation") {
        return {
          ...clonedStep,
          promptTemplate:
            "Generate a JSON object that matches the output schema and contains the recommended positions.",
          outputSchema: {
            type: "object",
            required: ["portfolio_summary", "positions"],
            properties: {
              portfolio_summary: { type: "string" },
              risk_management: { type: "string" },
              positions: {
                type: "array",
                items: {
                  type: "object",
                  required: [
                    "symbol",
                    "side",
                    "position_side",
                    "quantity",
                    "status",
                    "rationale",
                  ],
                  properties: {
                    symbol: { type: "string" },
                    side: { enum: ["buy", "sell"] },
                    position_side: { enum: ["long", "short"] },
                    quantity: { type: "number" },
                    status: { enum: ["draft", "paper", "real_money"] },
                    rationale: { type: "string" },
                    confidence: { enum: ["low", "medium", "high"] },
                    target_price: { type: "number" },
                    stop_loss: { type: "number" },
                    time_horizon: { type: "string" },
                  },
                },
              },
            },
          },
        }
      }

      return clonedStep
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export class PortfolioManagerAgentService {
  private cachedAgent: Agent | null = null

  constructor(private readonly repository: AgentRepository) {}

  async ensureAgent(): Promise<Agent> {
    if (this.cachedAgent) {
      return this.cachedAgent
    }

    let agent = await this.repository.getAgent(PORTFOLIO_MANAGER_AGENT_ID)
    if (!agent) {
      agent = await this.createAgent()
    }

    this.cachedAgent = agent
    return agent
  }

  private async createAgent(): Promise<Agent> {
    const workflow = createPortfolioManagerWorkflow()
    const timestamp = new Date()
    const agent: Agent = {
      id: PORTFOLIO_MANAGER_AGENT_ID,
      name: PORTFOLIO_MANAGER_NAME,
      description: PORTFOLIO_MANAGER_DESCRIPTION,
      role: "portfolio_manager",
      promptGuidance: PORTFOLIO_MANAGER_PROMPT,
      workflow,
      model: AI_MODELS["gpt-4o-mini"],
      temperature: 0.2,
      maxTokens: 2000,
      version: "1.0.0",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: "system",
      metadata: {
        isSystemManaged: true,
        description:
          "Automatically maintains structured positions for every portfolio.",
      },
    }

    await this.repository.createAgent(agent)
    log.info(
      "Portfolio Manager agent created",
      undefined,
      "AgentService"
    )
    return agent
  }
}

export const PORTFOLIO_MANAGER_ID = PORTFOLIO_MANAGER_AGENT_ID
