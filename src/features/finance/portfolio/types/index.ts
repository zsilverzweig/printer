export type {
  AssignedAgent,
  CreatePortfolioRequest,
  Portfolio,
  PortfolioPosition,
  PortfolioPositionStatus,
  UpdatePortfolioRequest,
  UsePortfoliosReturn,
} from "@/features/ai/agents/types";

// Re-export types for convenience
export type {
  Portfolio as PortfolioType,
  CreatePortfolioRequest as CreatePortfolioRequestType,
  UpdatePortfolioRequest as UpdatePortfolioRequestType,
} from "@/features/ai/agents/types";

// Import types for use in this file
import type {
  Portfolio as PortfolioType,
  CreatePortfolioRequest as CreatePortfolioRequestType,
  UpdatePortfolioRequest as UpdatePortfolioRequestType,
} from "@/features/ai/agents/types";

// New return type for the context-based hook
export interface UsePortfolioContextReturn {
  // Data
  portfolios: PortfolioType[];
  selectedPortfolio: PortfolioType | null;
  
  // Loading states
  loading: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  
  // Error handling
  error: string | null;
  
  // Actions
  createPortfolio: (request: CreatePortfolioRequestType) => Promise<PortfolioType>;
  createPortfolioDraftFromThesis: (thesis: string, options?: { name?: string; description?: string }) => Promise<PortfolioType>;
  updatePortfolio: (portfolioId: string, updates: UpdatePortfolioRequestType) => Promise<void>;
  deletePortfolio: (portfolioId: string) => Promise<void>;
  assignAgent: (portfolioId: string, agentId: string) => Promise<void>;
  unassignAgent: (portfolioId: string, agentId: string) => Promise<void>;
  addPortfolio: (portfolio: PortfolioType) => void;
  
  // UI state
  selectPortfolio: (portfolio: PortfolioType | null) => void;
  refreshPortfolios: () => void;
}
