// Generate Portfolio work implementation
import { AI_MODELS } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";
import { Work, WorkContext } from "../../../lib/types/work";
import { 
  GeneratePortfolioInput, 
  GeneratePortfolioOutput,
  WORK_TYPES 
} from "../types/work-types";

const GENERATE_PORTFOLIO_SCHEMA = {
  type: "object",
  required: ["thesis"],
  properties: {
    thesis: { type: "string", minLength: 10 },
    riskTolerance: { 
      type: "string", 
      enum: ["conservative", "moderate", "aggressive"] 
    },
    timeHorizon: { type: "string" }
  }
};

const GENERATE_PORTFOLIO_OUTPUT_SCHEMA = {
  type: "object",
  required: ["portfolio_summary", "risk_management", "positions"],
  properties: {
    portfolio_summary: { type: "string" },
    risk_management: { type: "string" },
    positions: {
      type: "array",
      items: {
        type: "object",
        required: ["symbol", "side", "position_side", "quantity", "status", "rationale"],
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
          time_horizon: { type: "string" }
        }
      }
    }
  }
};

const PROMPT_TEMPLATE = `You are the Portfolio Manager for Printer. Your mandate is to review an investment thesis and translate it into a structured set of trade instructions that Alpaca can execute. You make the final allocation decisions and must ensure risk controls are well defined.

Always respond with a strict JSON object that matches the provided schema. Do not include any explanatory text outside of the JSON. Every position must include:
- ticker symbol (all caps)
- whether we are buying or selling
- whether the resulting exposure is long or short
- an integer quantity of shares to target
- the status (draft, paper, or real_money)
- a concise rationale summarizing the alignment with the thesis

Whenever status is omitted, default it to "draft" so a human can review before capital is committed. Include portfolio-level summary and risk guidance fields to capture your broader thinking.

Investment Thesis: {{thesis}}
{{#if riskTolerance}}Risk Tolerance: {{riskTolerance}}{{/if}}
{{#if timeHorizon}}Time Horizon: {{timeHorizon}}{{/if}}`;

export const generatePortfolioWork: Work<GeneratePortfolioInput, GeneratePortfolioOutput> = {
  type: WORK_TYPES.GENERATE_PORTFOLIO,
  name: "Generate Portfolio",
  description: "Transforms investment theses into structured, trade-ready portfolios",
  inputSchema: GENERATE_PORTFOLIO_SCHEMA,
  outputSchema: GENERATE_PORTFOLIO_OUTPUT_SCHEMA,
  
  async execute(input: GeneratePortfolioInput, context: WorkContext): Promise<GeneratePortfolioOutput> {
    log.info("Executing generate portfolio work", {
      workType: WORK_TYPES.GENERATE_PORTFOLIO,
      userId: context.userId,
      agentId: context.agentId,
      thesisLength: input.thesis.length
    }, "GeneratePortfolioWork");

    try {
      // TODO: Implement actual AI execution
      // This would call the AI service with the prompt template and input
      // For now, return a mock response
      const mockOutput: GeneratePortfolioOutput = {
        portfolio_summary: "Mock portfolio generated from thesis",
        risk_management: "Conservative risk management approach",
        positions: []
      };

      log.success("Generate portfolio work completed", {
        workType: WORK_TYPES.GENERATE_PORTFOLIO,
        positionsCount: mockOutput.positions.length
      }, "GeneratePortfolioWork");

      return mockOutput;
    } catch (error) {
      log.error("Generate portfolio work failed", error, "GeneratePortfolioWork");
      throw error;
    }
  }
};
