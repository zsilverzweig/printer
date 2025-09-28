import { Timestamp } from "firebase/firestore";

import { AIRequest, AIResponse } from "@/lib/types/ai";
import { log } from "@/lib/utils/logger";


import {
  Agent,
  AgentTemplate,
  AgentVersion,
  AgentWork,
  AssignedAgent,
  Portfolio,
  PortfolioPosition,
} from "../../types";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FirestoreDocument = Record<string, any>;

export const omitUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      // Filter out undefined values from arrays
      const filteredArray = value.filter((item) => item !== undefined);
      if (filteredArray.length > 0) {
        result[key] = filteredArray;
      }
    } else if (value && typeof value === "object") {
      // Recursively clean nested objects
      const cleanedNested = omitUndefined(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        result[key] = cleanedNested;
      }
    } else {
      result[key] = value;
    }
  }

  return result as T;
};

export const toDate = (
  value: Timestamp | Date | null | undefined
): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
};

export const requireDate = (value: Timestamp | Date | null | undefined): Date =>
  toDate(value) ?? new Date();

export const serializeAgent = (agent: Agent) => {
  const serialized = omitUndefined({
    ...agent,
    createdAt: Timestamp.fromDate(agent.createdAt),
    updatedAt: Timestamp.fromDate(agent.updatedAt),
  });
  
  // Debug logging for model object
  log.info("Serializing agent model:", {
    agentId: agent.id,
    model: agent.model,
    modelType: typeof agent.model,
    modelName: agent.model?.name,
    modelNameType: typeof agent.model?.name
  }, "serializeAgent");
  
  
  return serialized;
};

export const deserializeAgent = (
  id: string,
  data: FirestoreDocument
): Agent => {
  const deserialized = {
    id,
    name: data.name,
    description: data.description,
    role: data.role,
    promptGuidance: data.promptGuidance,
    workflow: data.workflow,
    model: data.model,
    temperature: data.temperature,
    maxTokens: data.maxTokens,
    version: data.version,
    isActive: data.isActive,
    createdAt: requireDate(data.createdAt),
    updatedAt: requireDate(data.updatedAt),
    createdBy: data.createdBy,
    metadata: data.metadata ?? undefined,
  };
  
  // Debug logging for model object
  log.info("Deserializing agent model:", {
    agentId: id,
    model: data.model,
    modelType: typeof data.model,
    modelName: data.model?.name,
    modelNameType: typeof data.model?.name,
    deserializedModel: deserialized.model
  });
  
  return deserialized;
};

export const serializeAgentVersion = (version: AgentVersion) =>
  omitUndefined({
    ...version,
    createdAt: Timestamp.fromDate(version.createdAt),
  });

export const deserializeAgentVersion = (
  id: string,
  data: FirestoreDocument
): AgentVersion => ({
  id,
  agentId: data.agentId,
  version: data.version,
  promptGuidance: data.promptGuidance,
  workflow: data.workflow,
  model: data.model,
  temperature: data.temperature,
  maxTokens: data.maxTokens,
  createdAt: requireDate(data.createdAt),
  createdBy: data.createdBy,
  changeReason: data.changeReason ?? undefined,
  isActive: data.isActive,
});

export const serializeTemplate = (template: AgentTemplate) =>
  omitUndefined({
    ...template,
    createdAt: Timestamp.fromDate(template.createdAt),
    updatedAt: Timestamp.fromDate(template.updatedAt),
  });

export const deserializeTemplate = (
  id: string,
  data: FirestoreDocument
): AgentTemplate => ({
  id,
  name: data.name,
  description: data.description,
  role: data.role,
  category: data.category,
  defaultPromptGuidance: data.defaultPromptGuidance,
  defaultWorkflow: data.defaultWorkflow,
  defaultModel: data.defaultModel,
  defaultTemperature: data.defaultTemperature,
  defaultMaxTokens: data.defaultMaxTokens,
  isBuiltIn: data.isBuiltIn,
  createdAt: requireDate(data.createdAt),
  updatedAt: requireDate(data.updatedAt),
});

export const serializeAssignedAgent = (assigned: AssignedAgent) =>
  omitUndefined({
    agentId: assigned.agentId,
    agent: serializeAgent(assigned.agent),
    assignedAt: Timestamp.fromDate(assigned.assignedAt),
    assignedBy: assigned.assignedBy,
    isActive: assigned.isActive,
    lastWorkedAt: assigned.lastWorkedAt
      ? Timestamp.fromDate(assigned.lastWorkedAt)
      : null,
    workCount: assigned.workCount,
  });

export const deserializeAssignedAgent = (
  data: FirestoreDocument
): AssignedAgent => ({
  agentId: data.agentId,
  agent: deserializeAgent(data.agent.id, data.agent),
  assignedAt: requireDate(data.assignedAt),
  assignedBy: data.assignedBy,
  isActive: data.isActive,
  lastWorkedAt: toDate(data.lastWorkedAt),
  workCount: data.workCount ?? 0,
});

export const serializePortfolioPosition = (position: PortfolioPosition) =>
  omitUndefined({
    ...position,
  });

export const deserializePortfolioPosition = (
  data: FirestoreDocument
): PortfolioPosition => ({
  id: data.id,
  symbol: data.symbol,
  side: data.side,
  positionSide: data.positionSide,
  quantity: data.quantity ?? 0,
  status: data.status,
  rationale: data.rationale ?? "",
  confidence: data.confidence ?? undefined,
  targetPrice: data.targetPrice ?? undefined,
  stopLoss: data.stopLoss ?? undefined,
  timeHorizon: data.timeHorizon ?? undefined,
  metadata: data.metadata ?? undefined,
});

export const serializePortfolio = (portfolio: Portfolio) =>
  omitUndefined({
    id: portfolio.id,
    name: portfolio.name,
    description: portfolio.description,
    thesis: portfolio.thesis,
    assignedAgents: (portfolio.assignedAgents || []).map((assignment) =>
      serializeAssignedAgent(assignment)
    ),
    positions: (portfolio.positions || []).map((position) =>
      serializePortfolioPosition(position)
    ),
    userId: portfolio.userId,
    createdAt: Timestamp.fromDate(portfolio.createdAt),
    updatedAt: Timestamp.fromDate(portfolio.updatedAt),
    isActive: portfolio.isActive,
    metadata: portfolio.metadata ?? undefined,
  });

export const deserializePortfolio = (
  id: string,
  data: FirestoreDocument
): Portfolio => ({
  id,
  name: data.name,
  description: data.description,
  thesis: data.thesis,
  assignedAgents: Array.isArray(data.assignedAgents)
    ? data.assignedAgents.map((assignment: FirestoreDocument) =>
        deserializeAssignedAgent(assignment)
      )
    : [],
  positions: Array.isArray(data.positions)
    ? data.positions.map((position: FirestoreDocument) =>
        deserializePortfolioPosition(position)
      )
    : [],
  userId: data.userId,
  createdAt: requireDate(data.createdAt),
  updatedAt: requireDate(data.updatedAt),
  isActive: data.isActive,
  metadata: data.metadata ?? undefined,
});

export const serializeAIRequest = (request: AIRequest) =>
  omitUndefined({
    ...request,
    timestamp: Timestamp.fromDate(request.timestamp),
  });

export const deserializeAIRequest = (data: FirestoreDocument): AIRequest => {
  const { timestamp, ...rest } = data;
  return {
    ...(rest as Omit<AIRequest, "timestamp">),
    timestamp: requireDate(timestamp),
  };
};

export const serializeAIResponse = (response: AIResponse) =>
  omitUndefined({
    ...response,
    timestamp: Timestamp.fromDate(response.timestamp),
  });

export const deserializeAIResponse = (data: FirestoreDocument): AIResponse => {
  const { timestamp, ...rest } = data;
  return {
    ...(rest as Omit<AIResponse, "timestamp">),
    timestamp: requireDate(timestamp),
  };
};

export const serializeWork = (work: AgentWork) =>
  omitUndefined({
    id: work.id,
    portfolioId: work.portfolioId,
    agentId: work.agentId,
    agent: serializeAgent(work.agent),
    thesis: work.thesis,
    status: work.status,
    request: work.request ? serializeAIRequest(work.request) : undefined,
    response: work.response ? serializeAIResponse(work.response) : undefined,
    startedAt: Timestamp.fromDate(work.startedAt),
    completedAt: work.completedAt ? Timestamp.fromDate(work.completedAt) : null,
    error: work.error ?? undefined,
    metadata: work.metadata ?? undefined,
  });

export const deserializeWork = (
  id: string,
  data: FirestoreDocument
): AgentWork => ({
  id,
  portfolioId: data.portfolioId,
  agentId: data.agentId,
  agent: deserializeAgent(data.agent.id, data.agent),
  thesis: data.thesis,
  status: data.status,
  request: data.request ? deserializeAIRequest(data.request) : undefined,
  response: data.response ? deserializeAIResponse(data.response) : undefined,
  startedAt: requireDate(data.startedAt),
  completedAt: toDate(data.completedAt),
  error: data.error ?? undefined,
  metadata: data.metadata ?? undefined,
});

// Company Research Converters
export const serializeCompanyResearch = (research: Record<string, unknown>) =>
  omitUndefined({
    id: research.id,
    userId: research.userId,
    companyTicker: research.companyTicker,
    companyName: research.companyName ?? undefined,
    agentId: research.agentId,
    agentName: research.agentName,
    researchReport: research.researchReport,
    executiveSummary: research.executiveSummary ?? undefined,
    keyMetrics: research.keyMetrics ?? undefined,
    embeddings: research.embeddings ?? undefined,
    researchContext: research.researchContext ?? undefined,
    createdAt: Timestamp.fromDate(research.createdAt as Date),
    updatedAt: Timestamp.fromDate(research.updatedAt as Date),
    completedAt: research.completedAt ? Timestamp.fromDate(research.completedAt as Date) : undefined,
    status: research.status,
    errorMessage: research.errorMessage ?? undefined,
  });

export const deserializeCompanyResearch = (
  id: string,
  data: FirestoreDocument
) => ({
  id,
  userId: data.userId,
  companyTicker: data.companyTicker,
  companyName: data.companyName ?? undefined,
  agentId: data.agentId,
  agentName: data.agentName,
  researchReport: data.researchReport,
  executiveSummary: data.executiveSummary ?? undefined,
  keyMetrics: data.keyMetrics ?? undefined,
  embeddings: data.embeddings ?? undefined,
  researchContext: data.researchContext ?? undefined,
  createdAt: toDate(data.createdAt) ?? new Date(),
  updatedAt: toDate(data.updatedAt) ?? new Date(),
  completedAt: toDate(data.completedAt),
  status: data.status,
  errorMessage: data.errorMessage ?? undefined,
});
