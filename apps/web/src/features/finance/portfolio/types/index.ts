export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  side?: "buy" | "sell";
  status?: "draft" | "pending" | "executed" | "cancelled";
  weight: number;
  catalyst: string;
  rationale: string;
  priceTarget: number;
  reevaluateDate: string;
}

export type PortfolioPositionStatus = PortfolioPosition["status"];

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  thesis: string;
  positions: PortfolioPosition[];
  marketContext?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  isActive?: boolean;
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
