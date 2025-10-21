import { ApiService } from "@/lib/services/api-service";
import type {
  AggregateBar,
  GetAggsParams,
  LastTrade,
  ScreenedStockPreview,
} from "@/lib/types/market";
import { log } from "@/lib/utils/logger";

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

  async getScreener(date?: string): Promise<ScreenedStockPreview[]> {
    const url = date
      ? `/screener?date=${encodeURIComponent(date)}`
      : `/screener`;
    log.info("API Screener request", { url }, "FastApiService");
    const res = await this.api.get<unknown>(url);
    log.debug("API Screener raw response", res, "FastApiService");

    if (Array.isArray(res)) {
      return (res as unknown[]).map((raw): ScreenedStockPreview => {
        const r = raw as Record<string, unknown>;
        const toNum = (v: unknown, fallback = 0): number =>
          typeof v === "number" ? v : Number(v ?? fallback) || fallback;
        const toStr = (v: unknown, fallback = ""): string =>
          typeof v === "string" ? v : String(v ?? fallback);

        return {
          ticker: toStr(r["T"] ?? r["ticker"] ?? ""),
          open: toNum(r["o"] ?? r["open"]),
          high: toNum(r["h"] ?? r["high"] ?? r["c"]),
          low: toNum(r["l"] ?? r["low"] ?? r["c"]),
          close: toNum(r["c"] ?? r["close"]),
          volume: toNum(r["v"] ?? r["volume"]),
          transactions: toNum(r["n"] ?? r["transactions"]),
          window_start: toNum(r["t"] ?? r["window_start"]),
          rv: toNum(r["rv"]),
        };
      });
    }

    log.warn(
      "API Screener response not an array",
      { typeof: typeof res },
      "FastApiService"
    );
    return [];
  }
}

export const fastApiService = new FastApiService();
