// ============================================================================
// PORTFOLIO MANAGER AGENT
// ============================================================================

export const PortfolioManagerAgent = {
  id: "portfolio-manager",
  name: "Portfolio Manager",
  description: "Expert in transforming investment theses into structured portfolios",
  systemPrompt: "I am the Portfolio Manager. I ultimately decide what we invest in. I understand why we invest in what we invest in, and make judgements balancing all the information I have across returns, risks, and other factors.",
  
  // Agent Configuration
  model: {
    name: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 2000,
  },

  // ============================================================================
  // JOBS
  // ============================================================================
  
  jobs: {
    
    // ------------------------------------------------------------------------
    // REFINE THESIS JOB
    // ------------------------------------------------------------------------
    refineThesis: {
      name: "Refine Thesis",
      description: "Transform a raw investment thesis into a structured, compelling investment rationale",
      
      // Job Execution Prompt
      prompt: (input: { thesis: string }) => `
When refining an investment thesis, I need to:
1. Analyze the provided investment thesis
2. Create a compelling thesis title that captures the core investment idea
3. Write a refined thesis description that is clear, specific, and actionable
4. Explain my rationale for the improvements

Return a JSON object with: thesis_title, thesis_description, rationale

Here's what the user provided: ${input.thesis}
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // CREATE PORTFOLIO JOB (for future use)
    // ------------------------------------------------------------------------
    createPortfolio: {
      name: "Create Portfolio",
      description: "Generate a structured investment portfolio based on investment thesis",
      
      // Job Execution Prompt
      prompt: (input: { thesis: string }) => `
Create a diversified investment portfolio based on this investment thesis: ${input.thesis}

Return a JSON object with the following structure:
{
  "name": "Portfolio name that captures the investment theme",
  "description": "Brief description of the portfolio strategy",
  "thesis": "The refined investment thesis",
  "positions": [
    {
      "id": "unique_position_id",
      "symbol": "AAPL",
      "side": "buy",
      "status": "draft",
      "quantity": 100,
      "rationale": "Why this position fits the thesis",
      "confidence": "high",
      "target_price": 200,
      "stop_loss": 150,
      "time_horizon": "12 months"
    }
  ],
}

Generate positions that align with the investment thesis.
      `.trim(),
    },
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface RefineThesisInput {
  thesis: string;
}

export interface RefineThesisOutput {
  thesis_title: string;
  thesis_description: string;
  rationale: string;
}

export interface CreatePortfolioInput {
  thesis: string;
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  status: "draft" | "pending" | "executed" | "cancelled";
  quantity: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
  target_price?: number;
  stop_loss?: number;
  time_horizon?: string;
}

export interface CreatePortfolioOutput {
  name: string;
  description: string;
  thesis: string;
  positions: PortfolioPosition[];
}

export type PortfolioManagerAgentType = typeof PortfolioManagerAgent;
export type PortfolioManagerJobInput = RefineThesisInput | CreatePortfolioInput;
export type PortfolioManagerJobOutput = RefineThesisOutput | CreatePortfolioOutput;
