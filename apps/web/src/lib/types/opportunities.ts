// Market opportunity and pattern matching types

export interface MarketOpportunity {
  id: string
  company: string
  symbol: string
  thesisId: string
  matchScore: number
  fundamentalScore: number
  catalystScore: number
  marketScore: number
  riskScore: number
  vector: number[]
  analysis: OpportunityAnalysis
  recommendation: OpportunityRecommendation
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface OpportunityAnalysis {
  summary: string
  matchBreakdown: MatchBreakdown
  riskAssessment: RiskAssessment
  timingAnalysis: TimingAnalysis
  confidence: number
}

export interface MatchBreakdown {
  fundamental: number
  catalyst: number
  market: number
  risk: number
  overall: number
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high'
  factors: RiskFactor[]
  mitigation: string[]
}

export interface TimingAnalysis {
  urgency: 'low' | 'medium' | 'high'
  window: string
  catalysts: Catalyst[]
}

export interface OpportunityRecommendation {
  action: 'buy' | 'sell' | 'hold' | 'watch'
  confidence: number
  reasoning: string
  positionSize?: number
  entryPrice?: number
  targetPrice?: number
  stopLoss?: number
  timeHorizon: string
}

export interface RiskFactor {
  type: string
  description: string
  impact: number
  probability: number
}

export interface Catalyst {
  type: string
  description: string
  timing: string
  impact: number
  probability: number
  dependencies: string[]
}
