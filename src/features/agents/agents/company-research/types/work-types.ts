// Company Research Agent Work Types
// Defines input and output types for the Company Research Agent's work capabilities

// --- Company Research Work ---
export interface CompanyResearchInput {
  companyTicker: string;
  additionalContext?: Record<string, unknown>;
}

export interface CompanyResearchOutput {
  research_report: string;
  executive_summary: string;
}

// Work type constants
export const WORK_TYPES = {
  COMPANY_RESEARCH: "company_research",
} as const;

export type WorkType = typeof WORK_TYPES[keyof typeof WORK_TYPES];
