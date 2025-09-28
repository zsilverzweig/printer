// Portfolio Manager work type definitions
import { PortfolioPosition } from "@/features/ai/agents/types";

// Generate Portfolio Work
export interface GeneratePortfolioInput {
  thesis: string;
  riskTolerance?: "conservative" | "moderate" | "aggressive";
  timeHorizon?: string;
}

export interface GeneratePortfolioOutput {
  portfolio_summary: string;
  risk_management: string;
  positions: PortfolioPosition[];
}

// Refine Investment Thesis Work
export interface RefineThesisInput {
  thesis: string;
}

export interface RefineThesisOutput {
  refined_thesis: string;
  rationale: string;
}

// Work type constants
export const WORK_TYPES = {
  GENERATE_PORTFOLIO: "generate_portfolio",
  REFINE_THESIS: "refine_thesis",
} as const;

export type WorkType = typeof WORK_TYPES[keyof typeof WORK_TYPES];
