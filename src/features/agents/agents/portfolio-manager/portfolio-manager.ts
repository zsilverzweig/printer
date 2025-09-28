// Portfolio Manager agent with work capabilities
import { AI_MODELS } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";
import { BaseAgent } from "../../lib/types/base-agent";
import { 
  GeneratePortfolioInput, 
  GeneratePortfolioOutput,
  RefineThesisInput,
  RefineThesisOutput 
} from "./types/work-types";
import { generatePortfolioWork } from "./work/generate-portfolio";
import { refineThesisWork } from "./work/refine-thesis";

export class PortfolioManagerAgent {
  private agent: BaseAgent;

  constructor() {
    this.agent = this.createAgent();
  }

  private createAgent(): BaseAgent {
    const timestamp = new Date();
    return {
      id: "portfolio-manager-agent",
      name: "Portfolio Manager",
      description: "Transforms theses into trade-ready, structured portfolios and refines investment theses",
      model: AI_MODELS["gpt-4o-mini"],
      temperature: 0.2,
      maxTokens: 2000,
      work: [generatePortfolioWork, refineThesisWork],
      version: "1.0.0",
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: "system",
      metadata: {
        isSystemManaged: true,
        description: "Automatically maintains structured positions for every portfolio and refines investment theses"
      }
    };
  }

  async generatePortfolio(input: GeneratePortfolioInput, userId: string): Promise<GeneratePortfolioOutput> {
    log.info("Portfolio Manager: Generate Portfolio requested", {
      userId,
      agentId: this.agent.id,
      thesisLength: input.thesis.length
    }, "PortfolioManagerAgent");

    const context = {
      userId,
      agentId: this.agent.id,
      metadata: { workType: "generate_portfolio" }
    };

    return await generatePortfolioWork.execute(input, context);
  }

  async refineInvestmentThesis(input: RefineThesisInput, userId: string): Promise<RefineThesisOutput> {
    log.info("Portfolio Manager: Refine Thesis requested", {
      userId,
      agentId: this.agent.id,
      thesisLength: input.thesis.length
    }, "PortfolioManagerAgent");

    const context = {
      userId,
      agentId: this.agent.id,
      metadata: { workType: "refine_thesis" }
    };

    return await refineThesisWork.execute(input, context);
  }

  getAgent(): BaseAgent {
    return this.agent;
  }

  getWorkTypes(): string[] {
    return this.agent.work.map(work => work.type);
  }
}
