/**
 * Company Research Types
 * 
 * Defines the data structures for company research functionality including:
 * - Research requests and results
 * - Vector embeddings for semantic search
 * - Agent context and user context
 * - Research logs and history
 */

export interface CompanyResearch {
  id: string;
  userId: string;
  companyTicker: string;
  companyName: string;
  
  // Research sections - populated sequentially
  background: {
    report: string;   // Detailed research report
    summary: string;  // Executive summary
  } | null;
  
  recentNews: {
    summary: string;           // Summary of recent news
    keyDevelopments: string[]; // Key developments that matter
  } | null;
  
  synthesis: {
    synthesis: string;     // Comprehensive synthesis of all information
    keyInsights: string[]; // Key insights from synthesis
    riskFactors: string[]; // Updated risk factors
  } | null;
  
  // Overall recommendation at research level
  recommendation: string | null;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  
  // Status for real-time updates
  status: string;   // Status message from current agent job
  isComplete: boolean;
  errorMessage?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface CompanyMetrics {
  marketCap?: number;
  revenue?: number;
  profitMargin?: number;
  peRatio?: number;
  debtToEquity?: number;
  roe?: number;
  beta?: number;
  dividendYield?: number;
  [key: string]: unknown; // Allow for additional metrics
}

// Simple research response interface
export interface SimpleResearchResponse {
  ticker: string;
  companyName: string;
  report: string;
  summary: string;
  recommendation: string;
}

export interface UserContext {
  userId: string;
  userRole: string;
  investmentProfile?: {
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
    investmentHorizon?: 'short' | 'medium' | 'long';
    sectors?: string[];
  };
  researchHistory?: string[]; // Previous research IDs
}

export interface AgentContext {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentCapabilities: string[];
  model: string;
  temperature: number;
  maxTokens: number;
  promptGuidance?: string;
}

export interface MarketContext {
  marketConditions?: 'bull' | 'bear' | 'sideways';
  sectorTrends?: string[];
  economicIndicators?: {
    interestRates?: number;
    inflation?: number;
    gdp?: number;
  };
  timestamp: Date;
}

export interface CreateCompanyResearchRequest {
  companyTicker: string;
  researchFocus?: string[]; // e.g., ['financials', 'competitive_analysis', 'growth_prospects']
  additionalContext?: {
    investmentThesis?: string;
    specificQuestions?: string[];
    timeframe?: 'short_term' | 'medium_term' | 'long_term';
  };
}

export interface CompanyResearchSearchRequest {
  query: string;
  limit?: number;
  filters?: {
    dateRange?: {
      start: Date;
      end: Date;
    };
    agents?: string[];
    tickers?: string[];
    status?: CompanyResearch['status'][];
  };
}

export interface UseCompanyResearchReturn {
  // Data
  research: CompanyResearch[];
  selectedResearch: CompanyResearch | null;
  
  // Loading states
  loading: boolean;
  creating: boolean;
  searching: boolean;
  
  // Error handling
  error: string | null;
  
  // Actions
  createResearch: (request: CreateCompanyResearchRequest) => Promise<CompanyResearch>;
  getResearch: (id: string) => Promise<CompanyResearch | null>;
  searchResearch: (request: CompanyResearchSearchRequest) => Promise<CompanyResearch[]>;
  deleteResearch: (id: string) => Promise<void>;
  
  // UI state
  selectResearch: (research: CompanyResearch | null) => void;
  refreshResearch: () => Promise<void>;
}
