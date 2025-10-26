// Core AI types for agents, models, and requests

export interface AIAgent {
  id: string
  name: string
  description: string
  role: string
  model: AIModel
  systemPrompt: string
  temperature: number
  maxTokens: number
  version: string
  createdAt: Date
  updatedAt: Date
  isActive: boolean
  metadata?: Record<string, unknown>
}

export interface AIModel {
  name: string
  provider: 'openai' | 'anthropic' | 'google'
  maxTokens: number
  costPerInputToken: number
  costPerOutputToken: number
  capabilities: string[]
  contextWindow: number
}

export interface AIRequest {
  id: string
  agentId: string
  prompt: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
  timestamp: Date
  userId?: string
  sessionId?: string
}

export interface AIResponse {
  id: string
  requestId: string
  content: string
  model: string
  tokensUsed: TokenUsage
  cost: number
  timestamp: Date
  isCached: boolean
  processingTime: number
  metadata?: Record<string, unknown>
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AgentExecution {
  agentId: string
  startTime: Date
  endTime: Date
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string
  tokensUsed: TokenUsage
  cost: number
  metadata?: Record<string, unknown>
}

export type AIOperation =
  | 'company_research'
  | 'trade_analysis'
  | 'thesis_generation'
  | 'portfolio_generation'
  | 'pattern_matching'
  | 'risk_assessment'
  | 'market_analysis'
  | 'competitive_analysis'
  | 'financial_analysis'

export type AgentRole = 
  | 'researcher'
  | 'analyst'
  | 'validator'
  | 'synthesizer'
  | 'risk_assessor'
  | 'market_expert'
  | 'financial_expert'
  | 'competitive_expert'
