// ============================================================================
// FINANCIAL ANALYST AGENT
// ============================================================================

import { AI_MODELS } from "@/lib/models/ai-models";
import { AIAgent } from "@/lib/services/ai-service";

export const FinancialAnalystAgent: AIAgent = {
  id: "financial-analyst",
  name: "Financial Analyst",
  description:
    "Expert in financial analysis, stock validation, and investment decision support",
  systemPrompt:
    "I am the Financial Analyst. I specialize in validating stock symbols, setting price targets, and identifying investment catalysts. I focus on financial fundamentals, market data, and current events to provide actionable investment insights.",

  // Agent Configuration
  model: AI_MODELS.balanced, // Use the balanced model for financial analysis tasks

  // ============================================================================
  // JOBS
  // ============================================================================

  jobs: {
    // ------------------------------------------------------------------------
    // VALIDATE STOCKS JOB
    // ------------------------------------------------------------------------
    validateStocks: {
      name: "Validate Stocks",
      description: "Verify stock symbols are real and tradeable",
      statusMessage: "Financial Analyst is validating stock symbols",

      // Input/Output types
      inputType: {} as ValidateStocksInput,
      outputType: {} as ValidateStocksOutput,

      // Job Execution Prompt
      prompt: (input: ValidateStocksInput) =>
        `
Validate these stock symbols and return only real, tradeable companies:

${input.companies.map((c) => `${c.symbol} - ${c.name}`).join("\n")}

For each company, verify:
1. Symbol exists and is currently tradeable
2. Company is publicly traded on major exchanges (NYSE, NASDAQ, etc.)
3. Has sufficient liquidity (not penny stocks or OTC)
4. Is not delisted, suspended, or bankrupt
5. Has reasonable market cap (avoid micro-caps unless specifically relevant)

Common invalid patterns to reject:
- Symbols with special characters or numbers only
- Known delisted companies
- OTC or pink sheet stocks (unless specifically relevant)
- Companies with market cap under $100M (unless specifically relevant)
- Suspended or bankrupt companies

Return a JSON object matching this TypeScript interface:
interface ValidateStocksOutput {
  validCompanies: Array<{
    symbol: string;           // Validated stock symbol
    name: string;            // Company name
    sector: string;          // Industry sector
    marketCap?: string;      // Market capitalization
    isTradeable: boolean;    // Confirmed tradeable
    exchange?: string;       // Primary exchange
  }>;
  invalidSymbols: string[];  // Array of invalid symbols
  validationDetails: Record<string, any>; // Additional validation info
}

Focus on identifying only legitimate, tradeable stocks suitable for institutional investment purposes.
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // SET PRICE TARGETS JOB
    // ------------------------------------------------------------------------
    setPriceTargets: {
      name: "Set Price Targets",
      description: "Set price targets based on current events and analysis",
      statusMessage:
        "Financial Analyst is setting price targets for each company based on current events",

      // Input/Output types
      inputType: {} as SetPriceTargetsInput,
      outputType: {} as SetPriceTargetsOutput,

      // Job Execution Prompt
      prompt: (input: SetPriceTargetsInput) =>
        `
Set price targets for these companies based on current market conditions and events:

${input.companies.map((c) => `${c.symbol} - ${c.name}`).join("\n")}

${
  input.marketContext
    ? `Market Context: ${JSON.stringify(input.marketContext)}`
    : ""
}

For each company, provide:
1. Current price analysis
2. 12-month price target with rationale
3. Key catalysts and events affecting the target
4. Risk factors that could impact the target
5. Confidence level in the target

Return a JSON object matching this TypeScript interface:
interface SetPriceTargetsOutput {
  companies: Array<{
    symbol: string;           // Stock symbol
    name: string;            // Company name
    currentPrice?: number;    // Current stock price
    priceTarget: number;     // 12-month price target
    upside: number;          // Percentage upside/downside
    rationale: string;       // Reasoning for the target
    keyCatalysts: string[];  // Key events/catalysts
    riskFactors: string[];   // Risk factors
    confidence: 'low' | 'medium' | 'high'; // Confidence level
  }>;
  marketOutlook: string;     // Overall market outlook
  riskFactors: string[];     // General risk factors
}

Base targets on fundamental analysis, current events, and market conditions.
      `.trim(),
    },

    // ------------------------------------------------------------------------
    // IDENTIFY CATALYSTS JOB
    // ------------------------------------------------------------------------
    identifyCatalysts: {
      name: "Identify Catalysts",
      description: "Identify near-term catalysts for investment companies",
      statusMessage:
        "Financial Analyst is identifying near term catalysts for these companies",

      // Input/Output types
      inputType: {} as IdentifyCatalystsInput,
      outputType: {} as IdentifyCatalystsOutput,

      // Job Execution Prompt
      prompt: (input: IdentifyCatalystsInput) =>
        `
Identify the most important near-term catalyst for each company:

${input.companies.map((c) => `${c.symbol} - ${c.name}`).join("\n")}

For each company, identify ONE key catalyst that could trigger significant stock movement in the next 6-12 months. This should be:
- A specific, actionable event (earnings, product launch, partnership, regulatory decision, etc.)
- Something that will likely happen and move the stock
- A concise string describing the catalyst

Return a JSON object matching this TypeScript interface:
interface IdentifyCatalystsOutput {
  catalysts: Array<{
    symbol: string;           // Stock symbol
    name: string;            // Company name
    catalyst: string;        // Single key catalyst string
  }>;
}

Focus on the ONE most important catalyst per company that could significantly impact stock prices.
      `.trim(),
    },
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface ValidateStocksInput {
  companies: Array<{
    symbol: string;
    name: string;
    sector?: string;
  }>;
}

export interface ValidateStocksOutput {
  validCompanies: Array<{
    symbol: string;
    name: string;
    sector: string;
    marketCap?: string;
    isTradeable: boolean;
    exchange?: string;
  }>;
  invalidSymbols: string[];
  validationDetails: Record<string, any>;
}

export interface SetPriceTargetsInput {
  companies: Array<{
    symbol: string;
    name: string;
    sector?: string;
  }>;
  marketContext?: any;
}

export interface SetPriceTargetsOutput {
  companies: Array<{
    symbol: string;
    name: string;
    currentPrice?: number;
    priceTarget: number;
    upside: number;
    rationale: string;
    keyCatalysts: string[];
    riskFactors: string[];
    confidence: "low" | "medium" | "high";
  }>;
  marketOutlook: string;
  riskFactors: string[];
}

export interface IdentifyCatalystsInput {
  companies: Array<{
    symbol: string;
    name: string;
    sector?: string;
  }>;
}

export interface IdentifyCatalystsOutput {
  catalysts: Array<{
    symbol: string;
    name: string;
    catalyst: string;
  }>;
}

export type FinancialAnalystAgentType = typeof FinancialAnalystAgent;
export type FinancialAnalystJobInput =
  | ValidateStocksInput
  | SetPriceTargetsInput
  | IdentifyCatalystsInput;
export type FinancialAnalystJobOutput =
  | ValidateStocksOutput
  | SetPriceTargetsOutput
  | IdentifyCatalystsOutput;
