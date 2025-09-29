// ============================================================================
// PORTFOLIO MANAGER AGENT
// ============================================================================

import { AI_MODELS } from "@/lib/models/ai-models";
import { AIAgent } from "@/lib/services/ai-service";
import { PortfolioPosition } from "@/features/finance/portfolios/types";

export const PortfolioManagerAgent: AIAgent = {
  id: "portfolio-manager",
  name: "Portfolio Manager",
  description: "Expert in transforming investment theses into structured portfolios",
  systemPrompt: "I am the Portfolio Manager. I ultimately decide what we invest in. I understand why we invest in what we invest in, and make judgements balancing all the information I have across returns, risks, and other factors.",

  // Agent Configuration
  model: AI_MODELS.balanced, // Use the balanced model for portfolio management tasks

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
      
      // Input validation
      inputSchema: (input: any): RefineThesisInput => {
        if (!input.thesis || typeof input.thesis !== "string" || !input.thesis.trim()) {
          throw new Error("Thesis is required and must be a non-empty string");
        }
        return { thesis: input.thesis };
      },
      
      // Output validation
      outputSchema: (output: any): RefineThesisOutput => {
        if (!output.thesis_title || !output.thesis_description || !output.thesis) {
          throw new Error("AI response is missing required fields");
        }
        return {
          thesis_title: output.thesis_title,
          thesis_description: output.thesis_description,
          thesis: output.thesis
        };
      },
      
      // Job Execution Prompt
      prompt: (input: RefineThesisInput) => `
When refining an investment thesis, I need to:
1. Analyze the provided investment thesis and any refinement guidance
2. Create a compelling thesis title that captures the core investment idea
3. Write a refined thesis description that is clear, specific, and actionable
4. Develop a detailed, nuanced thesis that thoughtfully extends and builds upon the original ideas

IMPORTANT: If refinement guidance is provided, make targeted adjustments rather than wholesale rewrites. Focus on the specific changes requested while preserving the core investment logic.

For the thesis field, create a comprehensive, well-structured investment thesis that:
- Builds thoughtfully on the original concept
- Includes specific market dynamics and catalysts
- Addresses potential risks and counterarguments
- Provides clear investment rationale with supporting evidence
- Uses professional investment language and frameworks
- Is detailed enough to guide actual investment decisions
- Incorporates any specific refinement guidance provided

Return a JSON object matching this TypeScript interface:
interface RefineThesisOutput {
  thesis_title: string;      // Compelling title capturing the core investment idea
  thesis_description: string; // Clear, specific, and actionable thesis description
  thesis: string;           // Detailed, nuanced investment thesis with supporting analysis
}

Here's what the user provided: ${input.thesis}
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // CREATE PORTFOLIO JOB (for future use)
    // ------------------------------------------------------------------------
    createPortfolio: {
      name: "Create Portfolio",
      description: "Generate a structured investment portfolio based on investment thesis",
      
      // Input validation
      inputSchema: (input: any): CreatePortfolioInput => {
        if (!input.thesis || typeof input.thesis !== "string" || !input.thesis.trim()) {
          throw new Error("Thesis is required and must be a non-empty string");
        }
        return { thesis: input.thesis };
      },
      
      // Output validation
      outputSchema: (output: any): CreatePortfolioOutput => {
        if (!output.name || !output.description || !output.thesis || !Array.isArray(output.positions)) {
          throw new Error("AI response is missing required fields");
        }
        return {
          name: output.name,
          description: output.description,
          thesis: output.thesis,
          positions: output.positions
        };
      },
      
      // Job Execution Prompt
      prompt: (input: CreatePortfolioInput) => `
Create a diversified investment portfolio based on this investment thesis: ${input.thesis}

Return a JSON object matching this TypeScript interface:
interface CreatePortfolioOutput {
  name: string;              // Portfolio name that captures the investment theme
  description: string;       // Brief description of the portfolio strategy
  thesis: string;           // The refined investment thesis
  positions: Array<{
    id: string;               // Unique position identifier
    symbol: string;           // Stock symbol (e.g., "AAPL")
    side: "buy" | "sell";     // Position direction
    status: "draft" | "pending" | "executed" | "cancelled"; // Position status
    quantity: number;         // Number of shares
    rationale: string;        // Why this position fits the thesis
    confidence: "low" | "medium" | "high"; // Confidence level
    target_price?: number;    // Target price (optional)
    stop_loss?: number;       // Stop loss price (optional)
    time_horizon?: string;    // Investment time horizon (optional)
  }>;
}

Generate positions that align with the investment thesis.
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // OPTIMIZE PORTFOLIO JOB
    // ------------------------------------------------------------------------
    optimizePortfolio: {
      name: "Optimize Portfolio",
      description: "Assign optimal weights to create balanced investment portfolio",
      statusMessage: "Portfolio Manager is assigning weights for investment portfolio",
      
      // Input validation
      inputSchema: (input: any): OptimizePortfolioInput => {
        if (!input.thesis || typeof input.thesis !== "string" || !input.thesis.trim()) {
          throw new Error("Thesis is required and must be a non-empty string");
        }
        if (!input.companies || !Array.isArray(input.companies)) {
          throw new Error("Companies array is required");
        }
        return { 
          thesis: input.thesis,
          companies: input.companies,
          priceTargets: input.priceTargets,
          catalysts: input.catalysts
        };
      },
      
      // Output validation
      outputSchema: (output: any): OptimizePortfolioOutput => {
        if (!output.name || !output.description || !output.thesis || !Array.isArray(output.positions)) {
          throw new Error("AI response is missing required fields");
        }
        return {
          name: output.name,
          description: output.description,
          thesis: output.thesis,
          positions: output.positions,
          allocation: output.allocation,
          riskProfile: output.riskProfile
        };
      },
      
      // Job Execution Prompt
      prompt: (input: OptimizePortfolioInput) => `
Create an optimized investment portfolio based on this investment thesis: ${input.thesis}

Companies to consider:
${input.companies.map(c => `${c.symbol} - ${c.name}`).join('\n')}

${input.priceTargets ? `Price Targets: ${JSON.stringify(input.priceTargets)}` : ''}
${input.catalysts ? `Catalysts: ${JSON.stringify(input.catalysts)}` : ''}

Create a balanced portfolio with:
1. Optimal position sizing based on risk/reward
2. Diversification across sectors and market caps
3. Weight allocation that reflects conviction levels
4. Risk management considerations

Return a JSON object matching this TypeScript interface:
interface OptimizePortfolioOutput {
  name: string;              // Portfolio name
  description: string;       // Portfolio strategy description
  thesis: string;           // Investment thesis
  positions: Array<{
    symbol: string;           // Stock symbol
    name: string;            // Company name
    weight: number;          // Portfolio weight (0-1)
    shares: number;          // Number of shares
    rationale: string;       // Why this position and weight
    confidence: 'low' | 'medium' | 'high'; // Confidence level
    targetPrice?: number;    // Target price
    stopLoss?: number;       // Stop loss price
    timeHorizon: string;     // Investment time horizon
  }>;
  allocation: {
    totalWeight: number;     // Should equal 1.0
    sectorAllocation: Record<string, number>; // Sector weights
    marketCapAllocation: Record<string, number>; // Market cap weights
  };
  riskProfile: {
    expectedReturn: number;  // Expected annual return
    riskLevel: 'low' | 'medium' | 'high'; // Risk level
    maxDrawdown: number;    // Expected max drawdown
    sharpeRatio?: number;   // Risk-adjusted return
  };
}

Focus on creating a well-balanced, risk-managed portfolio that maximizes the investment thesis potential.
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
  thesis: string;
}

export interface CreatePortfolioInput {
  thesis: string;
}

export interface CreatePortfolioOutput {
  name: string;
  description: string;
  thesis: string;
  positions: PortfolioPosition[];
}

export interface OptimizePortfolioInput {
  thesis: string;
  companies: Array<{
    symbol: string;
    name: string;
    sector?: string;
  }>;
  priceTargets?: any;
  catalysts?: any;
}

export interface OptimizePortfolioOutput {
  name: string;
  description: string;
  thesis: string;
  positions: Array<{
    symbol: string;
    name: string;
    weight: number;
    shares: number;
    rationale: string;
    confidence: 'low' | 'medium' | 'high';
    targetPrice?: number;
    stopLoss?: number;
    timeHorizon: string;
  }>;
  allocation: {
    totalWeight: number;
    sectorAllocation: Record<string, number>;
    marketCapAllocation: Record<string, number>;
  };
  riskProfile: {
    expectedReturn: number;
    riskLevel: 'low' | 'medium' | 'high';
    maxDrawdown: number;
    sharpeRatio?: number;
  };
}

export type PortfolioManagerAgentType = typeof PortfolioManagerAgent;
export type PortfolioManagerJobInput = RefineThesisInput | CreatePortfolioInput | OptimizePortfolioInput;
export type PortfolioManagerJobOutput = RefineThesisOutput | CreatePortfolioOutput | OptimizePortfolioOutput;
