// ============================================================================
// RESEARCH ANALYST AGENT
// ============================================================================

import { AI_MODELS } from "@/lib/models/ai-models";
import { AIAgent } from "@/lib/services/ai-service";

export const ResearchAnalystAgent: AIAgent = {
  id: "research-analyst",
  name: "Research Analyst",
  description:
    "Expert in comprehensive company research and investment analysis",
  systemPrompt:
    "I am the Research Analyst. I conduct thorough analysis of companies to provide actionable investment insights. I focus on business fundamentals, financial health, competitive positioning, and growth prospects to deliver balanced, data-driven research reports.",

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

      // Input/Output types handled by TypeScript
      inputType: {} as ResearchCompanyInput,
      outputType: {} as ResearchCompanyOutput,

      // Job Execution Prompt
      prompt: (input: ResearchCompanyInput) =>
        `
Conduct comprehensive research on ${input.companyTicker.toUpperCase()}.

${
  input.researchFocus?.length
    ? `Focus Areas: ${input.researchFocus.join(", ")}`
    : ""
}
${
  input.additionalContext?.investmentThesis
    ? `Investment Thesis Context: ${input.additionalContext.investmentThesis}`
    : ""
}
${
  input.additionalContext?.specificQuestions?.length
    ? `Specific Questions: ${input.additionalContext.specificQuestions.join(
        ", "
      )}`
    : ""
}
${
  input.additionalContext?.timeframe
    ? `Timeframe: ${input.additionalContext.timeframe}`
    : ""
}

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
      description:
        "Research relevant markets and sectors for investment thesis",
      statusMessage: "Research Analyst is doing research on relevant markets",

      // Input/Output types handled by TypeScript
      inputType: {} as AnalyzeMarketsInput,
      outputType: {} as AnalyzeMarketsOutput,

      // Job Execution Prompt
      prompt: (input: AnalyzeMarketsInput) =>
        `
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
      statusMessage:
        "Research Analyst is identifying companies that meet thesis criteria",

      // Input/Output types handled by TypeScript
      inputType: {} as IdentifyCompaniesInput,
      outputType: {} as IdentifyCompaniesOutput,

      // Job Execution Prompt
      prompt: (input: IdentifyCompaniesInput) =>
        `
Identify companies that meet this investment thesis: ${input.thesis}

${
  input.marketAnalysis
    ? `Market Analysis Context: ${JSON.stringify(input.marketAnalysis)}`
    : ""
}

Find 20-30 companies that best align with the investment thesis. For each company, provide:
- Company name and ticker symbol
- Brief rationale for why it fits the thesis
- Key strengths that align with the investment thesis
- Market cap and sector information

After looking at them all, prune the list to 10-15 companies that truly align with the thesis.

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

    // ------------------------------------------------------------------------
    // GET CURRENT NEWS JOB
    // ------------------------------------------------------------------------
    getCurrentNews: {
      name: "Get Current News",
      description: "Retrieve and analyze current news about a company",
      statusMessage:
        "Research Analyst is gathering current news and developments",

      // Input/Output types handled by TypeScript
      inputType: {} as GetCurrentNewsInput,
      outputType: {} as GetCurrentNewsOutput,

      // Job Execution Prompt
      prompt: (input: GetCurrentNewsInput) =>
        `
Analyze current news and developments for ${
          input.companyName
        } (${input.companyTicker.toUpperCase()}).

${
  input.existingResearch
    ? `Existing Research Context: ${input.existingResearch}`
    : ""
}

Search for recent news covering the last ${input.newsTimeframe}. Focus on:
1. Latest company announcements and earnings
2. Industry developments affecting the company
3. Regulatory changes or legal matters
4. Competitive landscape updates
5. Market and economic factors impacting the business

For each significant news item, provide:
- Publication date and source
- Headline and brief summary
- Potential impact on the company's valuation and prospects
- Relevance to investment thesis

Return a JSON object matching this TypeScript interface:
interface GetCurrentNewsOutput {
  news: Array<{
    date: string;              // Publication date
    source: string;            // News source
    headline: string;          // News headline
    summary: string;           // Brief summary
    impact: string;            // Potential impact on company
    relevance: string;         // Relevance to investment thesis
    url?: string;              // News article URL if available
  }>;
  newsSummary: string;         // Overall summary of recent news
  keyDevelopments: string[];   // Key developments that matter for investors
  sentimentAnalysis: string;   // Overall sentiment analysis (positive/negative/neutral)
}

Focus on actionable news that could impact investment decisions.
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // SYNTHESIZE INFORMATION JOB
    // ------------------------------------------------------------------------
    synthesizeInformation: {
      name: "Synthesize Information",
      description:
        "Synthesize company research and current news into comprehensive analysis",
      statusMessage: "Research Analyst is synthesizing all information",

      // Input/Output types handled by TypeScript
      inputType: {} as SynthesizeInformationInput,
      outputType: {} as SynthesizeInformationOutput,

      // Job Execution Prompt
      prompt: (input: SynthesizeInformationInput) =>
        `
Synthesize all available information for ${
          input.companyName
        } (${input.companyTicker.toUpperCase()}).

Research Data: ${input.researchData}

News Data: ${input.newsData}

Investment Thesis: ${input.investmentThesis}

Create a comprehensive factual synthesis covering:
1. Updated company overview incorporating recent news
2. How recent developments affect the original research
3. Updated financial outlook based on new information
4. Key insights that emerged from the synthesis
5. Updated risk assessment with identified risk factors
6. Important facts and data points for decision-making

Return a JSON object matching this TypeScript interface:
interface SynthesizeInformationOutput {
  ticker: string;        // Company ticker symbol
  companyName: string;   // Full company name
  synthesis: string;     // Comprehensive synthesis of all information (3-4 pages)
  keyInsights: string[]; // Key insights from synthesis
  riskFactors: string[]; // Risk factors identified
}

Focus on factual analysis and insights. Avoid investment recommendations - just present the facts and analysis.
      `.trim(),
    },
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchCompanyInput {
  companyTicker: string;
  companyName?: string;
  researchFocus?: string[];
  additionalContext?: {
    investmentThesis?: string;
    specificQuestions?: string[];
    timeframe?: "short_term" | "medium_term" | "long_term";
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

export interface GetCurrentNewsInput {
  companyTicker: string;
  companyName: string;
  existingResearch?: string;
  newsTimeframe?: string;
}

export interface GetCurrentNewsOutput {
  news: Array<{
    date: string;
    source: string;
    headline: string;
    summary: string;
    impact: string;
    relevance: string;
    url?: string;
  }>;
  newsSummary: string;
  keyDevelopments: string[];
  sentimentAnalysis: string;
}

export interface SynthesizeInformationInput {
  companyTicker: string;
  companyName: string;
  researchData: string;
  newsData: string;
  investmentThesis?: string;
}

export interface SynthesizeInformationOutput {
  ticker: string;
  companyName: string;
  synthesis: string; // Comprehensive synthesis of all information
  keyInsights: string[]; // Key insights from synthesis
  riskFactors: string[]; // Risk factors identified
}

export type ResearchAnalystAgentType = typeof ResearchAnalystAgent;
export type ResearchAnalystJobInput =
  | ResearchCompanyInput
  | GetCurrentNewsInput
  | SynthesizeInformationInput;
export type ResearchAnalystJobOutput =
  | ResearchCompanyOutput
  | GetCurrentNewsOutput
  | SynthesizeInformationOutput;
