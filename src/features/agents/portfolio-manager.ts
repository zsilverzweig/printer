// ============================================================================
// PORTFOLIO MANAGER AGENT
// ============================================================================

import { AI_MODELS } from "@/lib/models/ai-models";
import { AIAgent,  } from "@/lib/services/ai-service";

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
      
      // Job Execution Prompt
      prompt: (input: { thesis: string }) => `
Create a diversified investment portfolio based on this investment thesis: ${input.thesis}

Return a JSON object matching this TypeScript interface:
interface CreatePortfolioOutput {
  name: string;              // Portfolio name that captures the investment theme
  description: string;       // Brief description of the portfolio strategy
  thesis: string;           // The refined investment thesis
  positions: PortfolioPosition[];
}

interface PortfolioPosition {
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
  thesis: string;
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
