import { JSONSchema7 } from "json-schema";

import { Work } from "@/features/agents/lib/types/work";
import { log } from "@/lib/utils/logger";

import { CompanyResearchInput, CompanyResearchOutput, WORK_TYPES } from "../types/work-types";

const COMPANY_RESEARCH_INPUT_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    companyTicker: { 
      type: "string", 
      minLength: 1,
      maxLength: 10,
      description: "The stock ticker symbol of the company to research" 
    },
    additionalContext: { 
      type: "object", 
      additionalProperties: true,
      description: "Additional context for the research" 
    },
  },
  required: ["companyTicker"],
  additionalProperties: false,
};

const COMPANY_RESEARCH_OUTPUT_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["research_report", "executive_summary"],
  properties: {
    research_report: { 
      type: "string", 
      description: "Comprehensive research report on the company" 
    },
    executive_summary: { 
      type: "string", 
      description: "Executive summary of key findings" 
    },
  },
  additionalProperties: false,
};

const PROMPT_TEMPLATE = `You are the Company Research Agent, specializing in comprehensive company research and investment analysis. Your role is to conduct thorough analysis of companies to provide actionable investment insights.

Research Focus Areas:
1. Company Overview: Business model, operations, market position
2. Financial Analysis: Revenue, profitability, cash flow, key ratios
3. Competitive Analysis: Market share, competitive advantages, threats
4. Growth Prospects: Revenue drivers, market expansion, product pipeline
5. Management Assessment: Leadership quality, corporate governance
6. Risk Assessment: Business, financial, and market risks
7. Investment Thesis: Strengths, opportunities, risks, valuation

Company to Research: {{companyTicker}}
{{#if additionalContext}}
Additional Context: {{additionalContext}}
{{/if}}

Please provide a comprehensive research report in JSON format with the following structure:
- research_report: Detailed analysis covering all relevant aspects
- executive_summary: Key findings and insights`;

export const companyResearchWork: Work<CompanyResearchInput, CompanyResearchOutput> = {
  type: WORK_TYPES.COMPANY_RESEARCH,
  name: "Company Research",
  description: "Conducts comprehensive research and analysis on companies for investment decisions",
  inputSchema: COMPANY_RESEARCH_INPUT_SCHEMA,
  outputSchema: COMPANY_RESEARCH_OUTPUT_SCHEMA,
  execute: async (input, context) => {
    log.info("Executing company research work", {
      workType: WORK_TYPES.COMPANY_RESEARCH,
      companyTicker: input.companyTicker,
      userId: context.userId,
      agentId: context.agentId,
    }, "CompanyResearchWork");

    try {
      // TODO: Implement actual AI execution
      // This would call the AI service with the prompt template and input
      // For now, return a mock response
      const mockOutput: CompanyResearchOutput = {
        research_report: `Comprehensive research report for ${input.companyTicker}. This is a detailed analysis covering business model, financial performance, competitive position, and growth prospects. The company operates in a dynamic market environment with both opportunities and challenges.`,
        executive_summary: `Key findings for ${input.companyTicker}: Strong market position with growth potential, but faces competitive pressures. The company demonstrates solid fundamentals and strategic positioning.`,
      };

      log.success("Company research work completed", {
        workType: WORK_TYPES.COMPANY_RESEARCH,
        companyTicker: input.companyTicker,
        summaryLength: mockOutput.executive_summary.length,
      }, "CompanyResearchWork");

      return mockOutput;
    } catch (error) {
      log.error("Company research work failed", error, "CompanyResearchWork");
      throw error;
    }
  },
};
