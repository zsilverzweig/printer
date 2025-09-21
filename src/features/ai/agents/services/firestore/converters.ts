import { Timestamp } from "firebase/firestore"

import {
  Agent,
  AgentTemplate,
  AgentVersion,
  AgentWork,
  AssignedAgent,
  Portfolio,
} from "../../types"
import { AIRequest, AIResponse } from "@/lib/types/ai"

export type FirestoreDocument = Record<string, any>

export const omitUndefined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T

export const toDate = (
  value: Timestamp | Date | null | undefined
): Date | undefined => {
  if (!value) return undefined
  if (value instanceof Timestamp) {
    return value.toDate()
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate()
  }
  return undefined
}

export const requireDate = (
  value: Timestamp | Date | null | undefined
): Date => toDate(value) ?? new Date()

export const serializeAgent = (agent: Agent) =>
  omitUndefined({
    ...agent,
    createdAt: Timestamp.fromDate(agent.createdAt),
    updatedAt: Timestamp.fromDate(agent.updatedAt),
  })

export const deserializeAgent = (
  id: string,
  data: FirestoreDocument
): Agent => ({
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
})

export const serializeAgentVersion = (version: AgentVersion) =>
  omitUndefined({
    ...version,
    createdAt: Timestamp.fromDate(version.createdAt),
  })

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
})

export const serializeTemplate = (template: AgentTemplate) =>
  omitUndefined({
    ...template,
    createdAt: Timestamp.fromDate(template.createdAt),
    updatedAt: Timestamp.fromDate(template.updatedAt),
  })

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
})

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
  })

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
})

export const serializePortfolio = (portfolio: Portfolio) =>
  omitUndefined({
    id: portfolio.id,
    name: portfolio.name,
    description: portfolio.description,
    thesis: portfolio.thesis,
    assignedAgents: (portfolio.assignedAgents || []).map((assignment) =>
      serializeAssignedAgent(assignment)
    ),
    userId: portfolio.userId,
    createdAt: Timestamp.fromDate(portfolio.createdAt),
    updatedAt: Timestamp.fromDate(portfolio.updatedAt),
    isActive: portfolio.isActive,
    metadata: portfolio.metadata ?? undefined,
  })

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
  userId: data.userId,
  createdAt: requireDate(data.createdAt),
  updatedAt: requireDate(data.updatedAt),
  isActive: data.isActive,
  metadata: data.metadata ?? undefined,
})

export const serializeAIRequest = (request: AIRequest) =>
  omitUndefined({
    ...request,
    timestamp: Timestamp.fromDate(request.timestamp),
  })

export const deserializeAIRequest = (data: FirestoreDocument): AIRequest => {
  const { timestamp, ...rest } = data
  return {
    ...(rest as Omit<AIRequest, "timestamp">),
    timestamp: requireDate(timestamp),
  }
}

export const serializeAIResponse = (response: AIResponse) =>
  omitUndefined({
    ...response,
    timestamp: Timestamp.fromDate(response.timestamp),
  })

export const deserializeAIResponse = (data: FirestoreDocument): AIResponse => {
  const { timestamp, ...rest } = data
  return {
    ...(rest as Omit<AIResponse, "timestamp">),
    timestamp: requireDate(timestamp),
  }
}

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
    completedAt: work.completedAt
      ? Timestamp.fromDate(work.completedAt)
      : null,
    error: work.error ?? undefined,
    metadata: work.metadata ?? undefined,
  })

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
})
