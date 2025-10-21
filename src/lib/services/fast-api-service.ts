import { ApiService } from "@/lib/services/api-service";
import type {
  AggregateBar,
  GetAggsParams,
  LastTrade,
} from "@/lib/types/market";

// Default to Next.js server-side proxy to avoid CORS in the browser
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_MARKET_API_BASE_URL || "";

export class FastApiService {
  private api: ApiService;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.api = new ApiService(baseUrl);
  }

  private static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
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

  async getNews(ticker: string, limit = 20): Promise<unknown[]> {
    const query = new URLSearchParams({
      ticker: ticker.toUpperCase(),
      limit: String(limit),
    });
    const res = await this.api.get<unknown>(`/news?${query.toString()}`);

    let items: unknown[] = [];
    if (Array.isArray(res)) {
      items = res as unknown[];
    } else if (FastApiService.isObject(res)) {
      const obj = res as Record<string, unknown>;
      const maybeArticles = obj["articles"];
      const maybeResults = obj["results"];
      if (Array.isArray(maybeArticles)) {
        items = maybeArticles as unknown[];
      } else if (Array.isArray(maybeResults)) {
        items = maybeResults as unknown[];
      }
    }

    return items;
  }
}

export const fastApiService = new FastApiService();
