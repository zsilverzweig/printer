// Company Research Unit (CRU) types

// Basic type definitions
export interface ResearchRevenueStream {
  name: string;
  description: string;
  amount?: number;
  growth?: number;
}

export interface ResearchKeyMetric {
  name: string;
  value: number;
  unit: string;
  trend: "up" | "down" | "stable";
}

export interface ResearchMoat {
  type: string;
  description: string;
  strength: "weak" | "moderate" | "strong";
}

export interface ResearchChallenge {
  description: string;
  severity: "low" | "medium" | "high";
  impact: string;
}

export interface ResearchFinancialRatio {
  name: string;
  value: number;
  benchmark?: number;
  interpretation: string;
}

export interface ResearchFinancialTrend {
  metric: string;
  period: string;
  values: number[];
  trend: "up" | "down" | "stable";
}

export interface ResearchFinancialProjection {
  year: number;
  revenue: number;
  profit: number;
  assumptions: string[];
}

export interface ResearchRedFlag {
  description: string;
  severity: "low" | "medium" | "high";
  impact: string;
}

export interface ResearchCompetitor {
  name: string;
  marketShare: number;
  strengths: string[];
  weaknesses: string[];
}

export interface ResearchMarketShareData {
  total: number;
  breakdown: Record<string, number>;
}

export interface ResearchPositioningAnalysis {
  description: string;
  differentiation: string[];
  targetMarket: string;
}

export interface ResearchAdvantage {
  type: string;
  description: string;
  sustainability: "temporary" | "sustainable";
}

export interface ResearchThreat {
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

export interface ResearchMarketSizeData {
  current: number;
  projected: number;
  growthRate: number;
  unit: string;
}

export interface ResearchMarketTrend {
  name: string;
  direction: "up" | "down" | "stable";
  impact: string;
  timeframe: string;
}

export interface ResearchOpportunity {
  description: string;
  size: number;
  probability: "low" | "medium" | "high";
  timeframe: string;
}

export interface ResearchBarrier {
  type: string;
  description: string;
  difficulty: "low" | "medium" | "high";
}

export interface ResearchRisk {
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  category: string;
}

export interface ResearchMitigation {
  risk: string;
  strategy: string;
  effectiveness: "low" | "medium" | "high";
}

export interface ResearchRiskScenario {
  name: string;
  probability: number;
  impact: string;
  outcome: string;
}

export interface ResearchCatalyst {
  description: string;
  timeframe: string;
  impact: "positive" | "negative" | "neutral";
  probability: number;
}

export interface CompanyResearchRequest {
  id: string;
  companySymbol: string;
  companyName: string;
  researchType: "full" | "quick" | "update";
  priority: "low" | "medium" | "high" | "urgent";
  requestedBy: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface CompanyResearchResponse {
  id: string;
  requestId: string;
  companySymbol: string;
  companyName: string;
  research: CRUResearch;
  agents: AgentExecution[];
  timestamp: Date;
  processingTime: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface CRUResearch {
  executiveSummary: string;
  businessModel: BusinessModelAnalysis;
  financialHealth: FinancialAnalysis;
  competitivePosition: CompetitiveAnalysis;
  marketOpportunity: MarketAnalysis;
  riskAssessment: RiskAnalysis;
  investmentThesis: InvestmentThesis;
  recommendations: Recommendation[];
}

export interface BusinessModelAnalysis {
  description: string;
  revenueStreams: ResearchRevenueStream[];
  keyMetrics: ResearchKeyMetric[];
  moats: ResearchMoat[];
  challenges: ResearchChallenge[];
}

export interface FinancialAnalysis {
  summary: string;
  keyRatios: ResearchFinancialRatio[];
  trends: ResearchFinancialTrend[];
  projections: ResearchFinancialProjection[];
  redFlags: ResearchRedFlag[];
}

export interface CompetitiveAnalysis {
  summary: string;
  competitors: ResearchCompetitor[];
  marketShare: ResearchMarketShareData;
  positioning: ResearchPositioningAnalysis;
  advantages: ResearchAdvantage[];
  threats: ResearchThreat[];
}

export interface MarketAnalysis {
  summary: string;
  marketSize: ResearchMarketSizeData;
  growthRate: number;
  trends: ResearchMarketTrend[];
  opportunities: ResearchOpportunity[];
  barriers: ResearchBarrier[];
}

export interface RiskAnalysis {
  summary: string;
  risks: ResearchRisk[];
  mitigations: ResearchMitigation[];
  scenarios: ResearchRiskScenario[];
}

export interface InvestmentThesis {
  summary: string;
  bullCase: string;
  bearCase: string;
  catalysts: ResearchCatalyst[];
  timeHorizon: string;
  confidence: number;
  targetPrice?: number;
}

export interface Recommendation {
  type: "buy" | "sell" | "hold" | "watch";
  confidence: number;
  reasoning: string;
  timeHorizon: string;
  targetPrice?: number;
  riskLevel: "low" | "medium" | "high";
}

// Import AgentExecution from ai.ts
import { AgentExecution } from "./ai";
