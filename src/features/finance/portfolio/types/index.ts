// Portfolio management types for Printer AI system

import { Agent } from "@/features/ai/agents/types";

// Core Portfolio Types
export interface Portfolio {
  id: string;
  name: string;
  description: string;
  thesis: string; // User-written investment thesis
  assignedAgents: AssignedAgent[];
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
  workCount: number;
  lastWorkedAt?: Date;
}

// Request/Response Types
export interface CreatePortfolioRequest {
  name: string;
  description: string;
  thesis: string;
  assignedAgentIds?: string[];
}

export interface UpdatePortfolioRequest {
  name?: string;
  description?: string;
  thesis?: string;
  assignedAgentIds?: string[];
}

// Hook Return Types
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
}
