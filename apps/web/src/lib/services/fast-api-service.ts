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
  private baseUrl: string;
  private useProxy: boolean;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
    this.useProxy = !baseUrl; // if no direct base URL, use Next.js proxy routes
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
    const endpoint = this.useProxy
      ? `/api/market/news?${query.toString()}`
      : `/news?${query.toString()}`;
    const url = endpoint;

    log.info(
      "[FastApiService] Making news request",
      { ticker, limit, url },
      "FastApiService"
    );

    try {
      const res = await this.api.get<unknown>(url);
      log.info(
        "[FastApiService] News API response received",
        {
          responseType: typeof res,
          isArray: Array.isArray(res),
          keys: FastApiService.isObject(res)
            ? Object.keys(res as Record<string, unknown>)
            : null,
        },
        "FastApiService"
      );

      let items: unknown[] = [];
      if (Array.isArray(res)) {
        items = res as unknown[];
        log.info(
          "[FastApiService] Response is array",
          { itemCount: items.length },
          "FastApiService"
        );
      } else if (FastApiService.isObject(res)) {
        const obj = res as Record<string, unknown>;
        const maybeArticles = obj["articles"];
        const maybeResults = obj["results"];
        if (Array.isArray(maybeArticles)) {
          items = maybeArticles as unknown[];
          log.info(
            "[FastApiService] Found articles array",
            { itemCount: items.length },
            "FastApiService"
          );
        } else if (Array.isArray(maybeResults)) {
          items = maybeResults as unknown[];
          log.info(
            "[FastApiService] Found results array",
            { itemCount: items.length },
            "FastApiService"
          );
        } else {
          log.warn(
            "[FastApiService] No articles or results array found in response",
            { obj },
            "FastApiService"
          );
        }
      } else {
        log.warn(
          "[FastApiService] Response is not array or object",
          { res },
          "FastApiService"
        );
      }

      log.info(
        "[FastApiService] Returning news items",
        { itemCount: items.length },
        "FastApiService"
      );
      return items;
    } catch (error) {
      log.error(
        "[FastApiService] News API request failed",
        error instanceof Error ? error.message : String(error),
        "FastApiService"
      );
      throw error;
    }
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
          price: toNum(r["price"] ?? r["c"] ?? r["close"]),
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
