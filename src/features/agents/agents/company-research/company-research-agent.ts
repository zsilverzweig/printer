import { AI_MODELS } from "@/lib/services/ai-service";

import { BaseAgent } from "../../lib/types/base-agent";
import { companyResearchWork } from "./work/company-research";

export const COMPANY_RESEARCH_AGENT_ID = "company-research-agent";

export const CompanyResearchAgent: BaseAgent = {
  id: COMPANY_RESEARCH_AGENT_ID,
  name: "Company Research Agent",
  description: "Conducts comprehensive research and analysis on companies for investment decisions",
  model: AI_MODELS["gpt-4o-mini"], // Default model
  temperature: 0.3,
  maxTokens: 3000,
  work: [
    companyResearchWork,
    // Add other work types here as needed
  ],
};
