// Trade archetype and pattern matching types

export interface TradeArchetype {
  id: string
  name: string
  description: string
  company: string
  symbol: string
  entryDate: Date
  exitDate: Date
  entryPrice: number
  exitPrice: number
  positionSize: number
  catalyst: string
  outcome: string
  successFactors: SuccessFactor[]
  marketConditions: MarketCondition[]
  vector: number[]
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

export interface SuccessFactor {
  category: 'fundamental' | 'catalyst' | 'market' | 'timing' | 'risk'
  description: string
  importance: number
  vector: number[]
}

export interface MarketCondition {
  type: 'economic' | 'sector' | 'sentiment' | 'liquidity'
  description: string
  impact: number
  vector: number[]
}

export interface InvestmentThesisGenerated {
  id: string
  archetypeId: string
  title: string
  summary: string
  marketConditions: ThesisMarketCondition[]
  companyCriteria: CompanyCriteria[]
  catalystFramework: CatalystFramework[]
  riskParameters: RiskParameter[]
  executionFramework: ExecutionFramework
  vector: number[]
  qualityScore: number
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

export interface ThesisMarketCondition {
  type: string
  description: string
  importance: number
  vector: number[]
}

export interface CompanyCriteria {
  metric: string
  operator: 'equals' | 'greater_than' | 'less_than' | 'between' | 'contains'
  value: unknown
  importance: number
  vector: number[]
}

export interface CatalystFramework {
  type: string
  timing: string
  impact: number
  probability: number
  vector: number[]
}

export interface RiskParameter {
  type: string
  threshold: number
  monitoring: string[]
  mitigation: string[]
  vector: number[]
}

export interface ExecutionFramework {
  entryCriteria: string[]
  positionSizing: string
  monitoring: string[]
  exitStrategy: string[]
  vector: number[]
}
