import { AgentTemplate, DEFAULT_WORKFLOW, Workflow } from "../../types";

const cloneWorkflow = (workflow: Workflow): Workflow => ({
  ...workflow,
  steps: workflow.steps.map((step) => ({
    ...step,
    dependencies: step.dependencies ? [...step.dependencies] : [],
  })),
  createdAt: new Date(workflow.createdAt),
  updatedAt: new Date(workflow.updatedAt),
});

interface TemplateSeed {
  id: AgentTemplate["id"];
  name: AgentTemplate["name"];
  description: AgentTemplate["description"];
  role: AgentTemplate["role"];
  category: AgentTemplate["category"];
  prompt: string;
  temperature: number;
  maxTokens: number;
}

const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    id: "business-fundamentals",
    name: "Business Fundamentals Agent",
    description: "Analyzes revenue, margins, growth, and core business metrics",
    role: "business_fundamentals",
    category: "cru",
    prompt: `You are a Business Fundamentals Analyst. Your role is to analyze the core business metrics and fundamentals of companies.

Focus on:
- Revenue growth and quality
- Profit margins and trends
- Market position and competitive advantages
- Business model sustainability
- Key performance indicators

Provide structured analysis with specific metrics and clear recommendations.`,
    temperature: 0.3,
    maxTokens: 2000,
  },
  {
    id: "risk-assessor",
    name: "Risk Assessment Agent",
    description: "Identifies and quantifies investment risks",
    role: "risk_assessor",
    category: "cru",
    prompt: `You are a Risk Assessment Specialist. Your role is to identify, analyze, and quantify investment risks.

Focus on:
- Market risks and volatility
- Company-specific risks
- Regulatory and compliance risks
- Financial risks and debt levels
- Operational risks
- Black swan event potential

Provide risk ratings, probability assessments, and mitigation strategies.`,
    temperature: 0.2,
    maxTokens: 2000,
  },
  {
    id: "narrative-analyst",
    name: "Narrative Analyst",
    description: "Analyzes market sentiment and investment narratives",
    role: "narrative_analyst",
    category: "cru",
    prompt: `You are a Narrative Analyst. Your role is to analyze market sentiment, investor narratives, and story-driven factors.

Focus on:
- Market sentiment and momentum
- Investor expectations and positioning
- Media coverage and public perception
- Sector trends and themes
- Catalysts and narrative drivers
- Contrarian opportunities

Assess narrative strength, sustainability, and potential for change.`,
    temperature: 0.4,
    maxTokens: 2000,
  },
  {
    id: "counterpoint-agent",
    name: "Counterpoint Agent",
    description:
      "Provides adversarial testing and challenges investment theses",
    role: "counterpoint_agent",
    category: "cru",
    prompt: `You are a Counterpoint Agent. Your role is to challenge investment theses and provide adversarial analysis.

Focus on:
- Identifying weaknesses in the thesis
- Alternative explanations and scenarios
- Potential negative catalysts
- Overlooked risks and concerns
- Market inefficiencies and mispricings
- Contrarian viewpoints

Be critical but constructive. Challenge assumptions and provide balanced perspectives.`,
    temperature: 0.5,
    maxTokens: 2000,
  },
];

const buildTemplate = (seed: TemplateSeed): AgentTemplate => {
  const timestamp = new Date();

  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    role: seed.role,
    category: seed.category,
    defaultPromptGuidance: seed.prompt,
    defaultWorkflow: cloneWorkflow(DEFAULT_WORKFLOW),
    defaultModel: "gpt-4o-mini",
    defaultTemperature: seed.temperature,
    defaultMaxTokens: seed.maxTokens,
    isBuiltIn: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createDefaultAgentTemplates = (): AgentTemplate[] =>
  TEMPLATE_SEEDS.map(buildTemplate);
