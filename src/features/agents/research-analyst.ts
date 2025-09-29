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

    // ------------------------------------------------------------------------
    // ANALYZE MARKETS JOB
    // ------------------------------------------------------------------------
    analyzeMarkets: {
      name: "Analyze Markets",
      description: "Research relevant markets and sectors for investment thesis",
      statusMessage: "Research Analyst is doing research on relevant markets",
      
      // Input validation
      inputSchema: (input: any): AnalyzeMarketsInput => {
        if (!input.thesis || typeof input.thesis !== "string" || !input.thesis.trim()) {
          throw new Error("Thesis is required and must be a non-empty string");
        }
        return { thesis: input.thesis };
      },
      
      // Output validation
      outputSchema: (output: any): AnalyzeMarketsOutput => {
        if (!output.marketAnalysis || !output.keySectors || !output.marketTrends) {
          throw new Error("AI response is missing required fields");
        }
        return {
          marketAnalysis: output.marketAnalysis,
          keySectors: output.keySectors,
          marketTrends: output.marketTrends,
          opportunities: output.opportunities
        };
      },
      
      // Job Execution Prompt
      prompt: (input: AnalyzeMarketsInput) => `
Analyze the relevant markets and sectors for this investment thesis: ${input.thesis}

Provide comprehensive market analysis covering:
1. Market Overview: Current state of relevant markets and sectors
2. Key Sectors: Identify the most important sectors for this thesis
3. Market Trends: Current trends affecting these markets
4. Opportunities: Specific market opportunities that align with the thesis

Return a JSON object matching this TypeScript interface:
interface AnalyzeMarketsOutput {
  marketAnalysis: string;    // Comprehensive market analysis
  keySectors: string[];      // Array of key sectors to focus on
  marketTrends: string[];    // Current market trends
  opportunities: string[];   // Specific market opportunities
}

Focus on actionable market insights that will inform company selection.
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // IDENTIFY COMPANIES JOB
    // ------------------------------------------------------------------------
    identifyCompanies: {
      name: "Identify Companies",
      description: "Find companies that meet the investment thesis criteria",
      statusMessage: "Research Analyst is identifying companies that meet thesis criteria",
      
      // Input validation
      inputSchema: (input: any): IdentifyCompaniesInput => {
        if (!input.thesis || typeof input.thesis !== "string" || !input.thesis.trim()) {
          throw new Error("Thesis is required and must be a non-empty string");
        }
        return { 
          thesis: input.thesis,
          marketAnalysis: input.marketAnalysis
        };
      },
      
      // Output validation
      outputSchema: (output: any): IdentifyCompaniesOutput => {
        if (!output.companies || !Array.isArray(output.companies)) {
          throw new Error("AI response is missing required companies array");
        }
        return {
          companies: output.companies,
          selectionCriteria: output.selectionCriteria,
          rationale: output.rationale
        };
      },
      
      // Job Execution Prompt
      prompt: (input: IdentifyCompaniesInput) => `
Identify companies that meet this investment thesis: ${input.thesis}

${input.marketAnalysis ? `Market Analysis Context: ${JSON.stringify(input.marketAnalysis)}` : ''}

Find 8-12 companies that best align with the investment thesis. For each company, provide:
- Company name and ticker symbol
- Brief rationale for why it fits the thesis
- Key strengths that align with the investment thesis
- Market cap and sector information

Return a JSON object matching this TypeScript interface:
interface IdentifyCompaniesOutput {
  companies: Array<{
    symbol: string;           // Stock ticker symbol
    name: string;            // Company name
    sector: string;          // Industry sector
    marketCap?: string;      // Market capitalization
    rationale: string;       // Why this company fits the thesis
    keyStrengths: string[];  // Key strengths for this thesis
  }>;
  selectionCriteria: string; // Criteria used for selection
  rationale: string;         // Overall selection rationale
}

Focus on companies that strongly align with the investment thesis.
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

export interface AnalyzeMarketsInput {
  thesis: string;
}

export interface AnalyzeMarketsOutput {
  marketAnalysis: string;
  keySectors: string[];
  marketTrends: string[];
  opportunities: string[];
}

export interface IdentifyCompaniesInput {
  thesis: string;
  marketAnalysis?: AnalyzeMarketsOutput;
}

export interface IdentifyCompaniesOutput {
  companies: Array<{
    symbol: string;
    name: string;
    sector: string;
    marketCap?: string;
    rationale: string;
    keyStrengths: string[];
  }>;
  selectionCriteria: string;
  rationale: string;
}

export type ResearchAnalystAgentType = typeof ResearchAnalystAgent;
export type ResearchAnalystJobInput = ResearchCompanyInput;
export type ResearchAnalystJobOutput = ResearchCompanyOutput;
