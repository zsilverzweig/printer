// Base agent types with work capabilities
import { AIModel } from "@/lib/types/ai";

import { Work } from "./work";

export interface BaseAgent {
  id: string;
  name: string;
  description: string;
  model: AIModel;
  temperature: number;
  maxTokens: number;
  work: Work<any, any>[]; // Array of work capabilities
  version: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface AgentCapabilities {
  workTypes: string[];
  maxConcurrentWork: number;
  supportedModels: string[];
}

export interface AgentExecutionContext {
  userId: string;
  agentId: string;
  workId: string;
  metadata?: Record<string, unknown>;
}
