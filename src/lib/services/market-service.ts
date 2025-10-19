import { ApiService } from "@/lib/services/api-service";
import type {
  AggregateBar,
  GetAggsParams,
  LastTrade,
} from "@/lib/types/market";

// Default to Next.js server-side proxy to avoid CORS in the browser
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_MARKET_API_BASE_URL || "/api/market";

export class MarketService {
  private api: ApiService;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.api = new ApiService(baseUrl);
  }

  async getAggregates(
    ticker: string,
    params: GetAggsParams
  ): Promise<AggregateBar[]> {
    const query = new URLSearchParams({
      multiplier: String(params.multiplier),
      timespan: params.timespan,
      from: params.from,
      to: params.to,
      ...(params.limit ? { limit: String(params.limit) } : {}),
      ...(params.paginate === false ? { paginate: "false" } : {}),
    });
    return this.api.get<AggregateBar[]>(
      `/aggs/${encodeURIComponent(ticker)}?${query.toString()}`
    );
  }

  async getLastTrade(ticker: string): Promise<LastTrade> {
    return this.api.get<LastTrade>(`/last-trade/${encodeURIComponent(ticker)}`);
  }
}

export const marketService = new MarketService();
