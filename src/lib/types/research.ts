// Company Research Unit (CRU) types

export interface CompanyResearchRequest {
  id: string
  companySymbol: string
  companyName: string
  researchType: 'full' | 'quick' | 'update'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  requestedBy: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface CompanyResearchResponse {
  id: string
  requestId: string
  companySymbol: string
  companyName: string
  research: CRUResearch
  agents: AgentExecution[]
  timestamp: Date
  processingTime: number
  confidence: number
  metadata?: Record<string, unknown>
}

export interface CRUResearch {
  executiveSummary: string
  businessModel: BusinessModelAnalysis
  financialHealth: FinancialAnalysis
  competitivePosition: CompetitiveAnalysis
  marketOpportunity: MarketAnalysis
  riskAssessment: RiskAnalysis
  investmentThesis: InvestmentThesis
  recommendations: Recommendation[]
}

export interface BusinessModelAnalysis {
  description: string
  revenueStreams: RevenueStream[]
  keyMetrics: KeyMetric[]
  moats: Moat[]
  challenges: Challenge[]
}

export interface FinancialAnalysis {
  summary: string
  keyRatios: FinancialRatio[]
  trends: FinancialTrend[]
  projections: FinancialProjection[]
  redFlags: RedFlag[]
}

export interface CompetitiveAnalysis {
  summary: string
  competitors: Competitor[]
  marketShare: MarketShareData
  positioning: PositioningAnalysis
  advantages: Advantage[]
  threats: Threat[]
}

export interface MarketAnalysis {
  summary: string
  marketSize: MarketSizeData
  growthRate: number
  trends: MarketTrend[]
  opportunities: Opportunity[]
  barriers: Barrier[]
}

export interface RiskAnalysis {
  summary: string
  risks: Risk[]
  mitigations: Mitigation[]
  scenarios: RiskScenario[]
}

export interface InvestmentThesis {
  summary: string
  bullCase: string
  bearCase: string
  catalysts: Catalyst[]
  timeHorizon: string
  confidence: number
  targetPrice?: number
}

export interface Recommendation {
  type: 'buy' | 'sell' | 'hold' | 'watch'
  confidence: number
  reasoning: string
  timeHorizon: string
  targetPrice?: number
  riskLevel: 'low' | 'medium' | 'high'
}

// Import AgentExecution from ai.ts
import { AgentExecution } from '../ai'
