// Agent team and workflow types

export interface AgentTeam {
  id: string
  name: string
  description: string
  agents: AgentTeamMember[]
  workflow: WorkflowStep[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

export interface AgentTeamMember {
  agentId: string
  role: 'primary' | 'secondary' | 'validator' | 'synthesizer'
  order: number
  dependencies?: string[]
  outputFormat?: string
  metadata?: Record<string, unknown>
}

export interface WorkflowStep {
  id: string
  name: string
  agentId: string
  inputMapping: Record<string, string>
  outputMapping: Record<string, string>
  conditions?: WorkflowCondition[]
  retryPolicy?: RetryPolicy
  timeout?: number
}

export interface WorkflowCondition {
  field: string
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'
  value: unknown
}

export interface RetryPolicy {
  maxRetries: number
  backoffMultiplier: number
  maxBackoff: number
}
