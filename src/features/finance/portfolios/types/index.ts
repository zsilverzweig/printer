// Portfolio types for the Printer finance feature

export interface PortfolioPosition {
  positionSide: ReactNode;
  targetPrice: undefined;
  stopLoss: undefined;
  id: string;
  symbol: string;
  side: "buy" | "sell";
  status: "draft" | "pending" | "executed" | "cancelled";
  quantity: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
  target_price?: number;
  stop_loss?: number;
  time_horizon?: string;
}

export type PortfolioPositionStatus = PortfolioPosition["status"];

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  thesis: string;
  positions: PortfolioPosition[];
  createdAt: string;
  updatedAt: string;
  isActive?: boolean;
  assignedAgents?: any[];
  metadata: Record<string, any>;
}

export interface CreatePortfolioRequest {
  name: string;
  description: string;
  thesis: string;
  positions?: PortfolioPosition[];
  userId: string;
  metadata?: Record<string, any>;
}

export interface UpdatePortfolioRequest {
  name?: string;
  description?: string;
  thesis?: string;
  positions?: PortfolioPosition[];
  isActive?: boolean;
  metadata?: Record<string, any>;
}
