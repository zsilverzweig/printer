// Detailed analysis types for financial, market, and competitive analysis

export interface RevenueStream {
  type: string
  description: string
  percentage: number
  growth: number
  sustainability: number
}

export interface KeyMetric {
  name: string
  value: number
  unit: string
  trend: 'up' | 'down' | 'stable'
  benchmark?: number
  importance: number
}

export interface Moat {
  type: 'brand' | 'network' | 'switching_cost' | 'regulatory' | 'technology'
  description: string
  strength: number
  sustainability: number
}

export interface Challenge {
  type: string
  description: string
  severity: number
  timeline: string
  mitigation: string[]
}

export interface FinancialRatio {
  name: string
  value: number
  benchmark: number
  trend: 'improving' | 'declining' | 'stable'
  interpretation: string
}

export interface FinancialTrend {
  metric: string
  period: string
  values: number[]
  trend: 'up' | 'down' | 'stable'
  significance: number
}

export interface FinancialProjection {
  year: number
  revenue: number
  profit: number
  assumptions: string[]
  confidence: number
}

export interface RedFlag {
  type: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  impact: string
  monitoring: string[]
}

export interface Competitor {
  name: string
  symbol: string
  marketShare: number
  strengths: string[]
  weaknesses: string[]
  threat: number
}

export interface MarketShareData {
  current: number
  trend: 'gaining' | 'losing' | 'stable'
  competitors: Competitor[]
  totalMarket: number
}

export interface PositioningAnalysis {
  differentiation: string[]
  advantages: string[]
  vulnerabilities: string[]
  brand: number
  pricing: number
  quality: number
}

export interface Advantage {
  type: string
  description: string
  sustainability: number
  impact: number
}

export interface Threat {
  type: string
  description: string
  probability: number
  impact: number
  timeline: string
}

export interface MarketSizeData {
  current: number
  projected: number
  growthRate: number
  segments: MarketSegment[]
}

export interface MarketSegment {
  name: string
  size: number
  growth: number
  penetration: number
}

export interface MarketTrend {
  name: string
  description: string
  impact: number
  timeline: string
  drivers: string[]
}

export interface Opportunity {
  type: string
  description: string
  size: number
  probability: number
  timeline: string
  requirements: string[]
}

export interface Barrier {
  type: string
  description: string
  height: number
  mitigation: string[]
}

export interface Risk {
  type: string
  description: string
  probability: number
  impact: number
  timeline: string
  indicators: string[]
}

export interface Mitigation {
  risk: string
  strategy: string
  effectiveness: number
  cost: number
}

export interface RiskScenario {
  name: string
  probability: number
  impact: number
  description: string
  triggers: string[]
  response: string[]
}
