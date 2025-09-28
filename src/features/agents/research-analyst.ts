// ============================================================================
// RESEARCH ANALYST AGENT
// ============================================================================

import { AI_MODELS } from "@/lib/models/ai-models";
import { AIAgent } from "@/lib/services/ai-service";

export const ResearchAnalystAgent: AIAgent = {
  id: "research-analyst",
  name: "Research Analyst",
  description: "Expert in comprehensive company research and investment analysis",
  systemPrompt: "I am the Research Analyst. I conduct thorough analysis of companies to provide actionable investment insights. I focus on business fundamentals, financial health, competitive positioning, and growth prospects to deliver balanced, data-driven research reports.",

  // Agent Configuration
  model: AI_MODELS.balanced, // Use the balanced model for research tasks

  // ============================================================================
  // JOBS
  // ============================================================================
  
  jobs: {
    
    // ------------------------------------------------------------------------
    // RESEARCH COMPANY JOB
    // ------------------------------------------------------------------------
    researchCompany: {
      name: "Research Company",
      description: "Conduct comprehensive research on a specific company",
      
      // Input validation
      inputSchema: (input: any): ResearchCompanyInput => {
        if (!input.companyTicker || typeof input.companyTicker !== "string" || !input.companyTicker.trim()) {
          throw new Error("Company ticker is required and must be a non-empty string");
        }
        return { 
          companyTicker: input.companyTicker,
          researchFocus: input.researchFocus,
          additionalContext: input.additionalContext
        };
      },
      
      // Output validation
      outputSchema: (output: any): ResearchCompanyOutput => {
        if (!output.ticker || !output.companyName || !output.report || !output.summary || !output.recommendation) {
          throw new Error("AI response is missing required fields");
        }
        return {
          ticker: output.ticker,
          companyName: output.companyName,
          report: output.report,
          summary: output.summary,
          recommendation: output.recommendation
        };
      },
      
      // Job Execution Prompt
      prompt: (input: ResearchCompanyInput) => `
Conduct comprehensive research on ${input.companyTicker.toUpperCase()}.

${input.researchFocus?.length ? `Focus Areas: ${input.researchFocus.join(', ')}` : ''}
${input.additionalContext?.investmentThesis ? `Investment Thesis Context: ${input.additionalContext.investmentThesis}` : ''}
${input.additionalContext?.specificQuestions?.length ? `Specific Questions: ${input.additionalContext.specificQuestions.join(', ')}` : ''}
${input.additionalContext?.timeframe ? `Timeframe: ${input.additionalContext.timeframe}` : ''}

Provide a detailed research report covering:
1. Company Overview: Business model, operations, market position
2. Financial Analysis: Revenue, profitability, cash flow, key ratios
3. Growth Prospects: Market opportunities, expansion plans, product pipeline
4. Risk Assessment: Business, financial, and market risks
5. Investment Recommendation: Overall assessment with clear reasoning

Return a JSON object matching this TypeScript interface:
interface ResearchCompanyOutput {
  ticker: string;           // Company ticker symbol
  companyName: string;      // Full company name
  report: string;          // Detailed research report (2-3 pages)
  summary: string;         // Executive summary (2-3 paragraphs)
  recommendation: string;  // Clear investment recommendation with reasoning
}

Focus on actionable insights and balanced analysis.
      `.trim(),
    },
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchCompanyInput {
  companyTicker: string;
  researchFocus?: string[];
  additionalContext?: {
    investmentThesis?: string;
    specificQuestions?: string[];
    timeframe?: 'short_term' | 'medium_term' | 'long_term';
  };
}

export interface ResearchCompanyOutput {
  ticker: string;
  companyName: string;
  report: string;
  summary: string;
  recommendation: string;
}

export type ResearchAnalystAgentType = typeof ResearchAnalystAgent;
export type ResearchAnalystJobInput = ResearchCompanyInput;
export type ResearchAnalystJobOutput = ResearchCompanyOutput;
