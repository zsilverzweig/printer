// Agent management types for Printer AI system

import { AIModel, AIRequest, AIResponse } from "@/lib/types/ai";
import { AlpacaOrderSide, AlpacaPositionSide } from "@/lib/types/alpaca";

// Core Agent Types
export interface Agent {
  id: string;
  name: string;
  description: string;
  role: AgentRole;
  promptGuidance: string; // The "prompt guidance" you mentioned
  workflow: Workflow;
  model: AIModel;
  temperature: number;
  maxTokens: number;
  version: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface AgentVersion {
  id: string;
  agentId: string;
  version: string;
  promptGuidance: string;
  workflow: Workflow;
  model: AIModel;
  temperature: number;
  maxTokens: number;
  createdAt: Date;
  createdBy: string;
  changeReason?: string;
  isActive: boolean;
}

// Workflow Types
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  description: string;
  promptTemplate: string;
  outputSchema?: Record<string, unknown>;
  dependencies?: string[];
  order: number;
}

export type WorkflowStepType =
  | "thesis_analysis"
  | "prompt_guidance_application"
  | "response_generation"
  | "validation"
  | "synthesis";

// Agent Templates
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  role: AgentRole;
  category: AgentCategory;
  defaultPromptGuidance: string;
  defaultWorkflow: Workflow;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentRole =
  | "business_fundamentals"
  | "risk_assessor"
  | "narrative_analyst"
  | "counterpoint_agent"
  | "product_analyst"
  | "management_analyst"
  | "market_analyst"
  | "financial_analyst"
  | "competitive_analyst"
  | "portfolio_manager"
  | "research_analyst"
  | "custom";

export type AgentCategory =
  | "cru" // Company Research Unit
  | "senior_management"
  | "specialized"
  | "custom";

// Portfolio Types
export type PortfolioPositionStatus = "draft" | "paper" | "real_money";

export interface PortfolioPosition {
  id: string;
  symbol: string;
  side: AlpacaOrderSide;
  positionSide: AlpacaPositionSide;
  quantity: number;
  status: PortfolioPositionStatus;
  rationale: string;
  confidence?: "low" | "medium" | "high";
  targetPrice?: number;
  stopLoss?: number;
  timeHorizon?: string;
  metadata?: Record<string, unknown>;
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  thesis: string; // User-written investment thesis
  assignedAgents: AssignedAgent[];
  positions: PortfolioPosition[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface AssignedAgent {
  agentId: string;
  agent: Agent;
  assignedAt: Date;
  assignedBy: string;
  isActive: boolean;
  lastWorkedAt?: Date;
  workCount: number;
}

// Agent Work Execution
export interface AgentWork {
  id: string;
  portfolioId: string;
  agentId: string;
  agent: Agent;
  thesis: string;
  status: WorkStatus;
  request?: AIRequest;
  response?: AIResponse;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type WorkStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// Service Return Types
export interface CreateAgentRequest {
  name: string;
  description: string;
  role: AgentRole;
  promptGuidance: string;
  workflow?: Workflow;
  templateId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  promptGuidance?: string;
  workflow?: Workflow;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  changeReason?: string;
}

export interface CreatePortfolioRequest {
  name: string;
  description: string;
  thesis: string;
  assignedAgentIds?: string[];
  positions?: PortfolioPosition[];
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}

export interface UpdatePortfolioRequest {
  name?: string;
  description?: string;
  thesis?: string;
  assignedAgentIds?: string[];
  positions?: PortfolioPosition[];
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}

// Hook Return Types
export interface UseAgentsReturn {
  agents: Agent[];
  templates: AgentTemplate[];
  loading: boolean;
  error: string | null;
  createAgent: (request: CreateAgentRequest) => Promise<Agent>;
  updateAgent: (agentId: string, request: UpdateAgentRequest) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<void>;
  getAgentVersions: (agentId: string) => Promise<AgentVersion[]>;
  revertToVersion: (agentId: string) => Promise<Agent>;
}

export interface UsePortfoliosReturn {
  portfolios: Portfolio[];
  loading: boolean;
  error: string | null;
  createPortfolio: (request: CreatePortfolioRequest) => Promise<Portfolio>;
  updatePortfolio: (
    portfolioId: string,
    request: UpdatePortfolioRequest
  ) => Promise<Portfolio>;
  deletePortfolio: (portfolioId: string) => Promise<void>;
  assignAgent: (portfolioId: string, agentId: string) => Promise<void>;
  unassignAgent: (portfolioId: string, agentId: string) => Promise<void>;
  createPortfolioDraftFromThesis: (
    thesis: string,
    options?: {
      name?: string;
      description?: string;
    }
  ) => Promise<Portfolio>;
  addPortfolio: (portfolio: Portfolio) => void;
}

export interface UseAgentWorkReturn {
  workHistory: AgentWork[];
  loading: boolean;
  error: string | null;
  executeWork: (portfolioId: string, agentId: string) => Promise<AgentWork>;
  getWorkStatus: (workId: string) => Promise<AgentWork>;
  cancelWork: (workId: string) => Promise<void>;
}

// Default Workflow for Simple Agent Execution
export const DEFAULT_WORKFLOW: Workflow = {
  id: "default-workflow",
  name: "Default Thesis Analysis Workflow",
  description:
    "Take the thesis of the investment, use prompt guidance, and provide a response",
  steps: [
    {
      id: "thesis-analysis",
      name: "Thesis Analysis",
      type: "thesis_analysis",
      description: "Analyze the provided investment thesis",
      promptTemplate: "Analyze the following investment thesis: {thesis}",
      order: 1,
    },
    {
      id: "prompt-guidance-application",
      name: "Apply Prompt Guidance",
      type: "prompt_guidance_application",
      description: "Apply the agent's specific prompt guidance",
      promptTemplate: "{promptGuidance}\n\nBased on the thesis: {thesis}",
      dependencies: ["thesis-analysis"],
      order: 2,
    },
    {
      id: "response-generation",
      name: "Generate Response",
      type: "response_generation",
      description: "Generate the final response",
      promptTemplate:
        "Provide your analysis and recommendations based on the above.",
      dependencies: ["prompt-guidance-application"],
      order: 3,
    },
  ],
  version: "1.0.0",
  createdAt: new Date(),
  updatedAt: new Date(),
};
