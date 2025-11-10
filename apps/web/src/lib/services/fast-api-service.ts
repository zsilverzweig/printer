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
        const toNullableNumber = (v: unknown): number | null => {
          if (v === null || v === undefined) {
            return null;
          }
          const parsed = Number(v);
          return Number.isFinite(parsed) ? parsed : null;
        };
        const toStrOrNull = (v: unknown): string | null => {
          if (v === null || v === undefined) {
            return null;
          }
          return typeof v === "string" ? v : String(v);
        };

        return {
          ticker: typeof r["ticker"] === "string"
            ? (r["ticker"] as string)
            : String(r["ticker"] ?? r["T"] ?? ""),
          price: toNum(r["price"] ?? r["c"] ?? 0),
          today_vol: toNum(r["today_vol"] ?? r["volume"] ?? 0),
          rv14: toNum(r["rv14"] ?? 0),
          rv_lw: toNum(r["rv_lw"] ?? 0),
          type: toStrOrNull(r["type"]),
          primary_exchange: toStrOrNull(r["primary_exchange"] ?? r["exchange"]),
          sic_description: toStrOrNull(r["sic_description"]),
          market_cap: toNullableNumber(r["market_cap"]),
          public_float: toNullableNumber(r["public_float"]),
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

  async getHistoricalBars(
    symbol: string,
    fromTime: string,
    toTime: string,
    timeframe: "1m" | "5m" | "15m" | "1h" | "1d" = "1m",
    limit: number = 10000
  ): Promise<AggregateBar[]> {
    const query = new URLSearchParams({
      from_time: fromTime,
      to_time: toTime,
      timeframe: timeframe,
      limit: String(limit),
    });

    const endpoint = this.useProxy
      ? `/api/market/bars/${encodeURIComponent(symbol)}?${query.toString()}`
      : `/bars/${encodeURIComponent(symbol)}?${query.toString()}`;

    log.info(
      "[FastApiService] Fetching historical bars",
      { symbol, fromTime, toTime, timeframe, limit, endpoint },
      "FastApiService"
    );

    try {
      const response = await this.api.get<{
        symbol: string;
        timeframe: string;
        from: string;
        to: string;
        count: number;
        bars: Array<{
          time: string;
          symbol: string;
          open: number | null;
          high: number | null;
          low: number | null;
          close: number | null;
          volume: number | null;
          vwap: number | null;
          trade_count: number | null;
        }>;
      }>(endpoint);

      // Transform database format to AggregateBar format
      const aggregateBars: AggregateBar[] = response.bars
        .map((bar) => {
          // Convert ISO time string to milliseconds timestamp
          const timestamp = new Date(bar.time).getTime();

          return {
            t: timestamp,
            o: bar.open ?? 0,
            h: bar.high ?? 0,
            l: bar.low ?? 0,
            c: bar.close ?? 0,
            v: bar.volume ?? undefined,
            vw: bar.vwap ?? undefined,
            n: bar.trade_count ?? undefined,
          };
        })
        .filter(
          (bar) =>
            bar.t &&
            bar.o != null &&
            bar.h != null &&
            bar.l != null &&
            bar.c != null
        )
        .sort((a, b) => a.t - b.t); // Sort ascending (API returns DESC)

      log.info(
        "[FastApiService] Historical bars fetched",
        {
          symbol,
          count: aggregateBars.length,
          timeframe,
        },
        "FastApiService"
      );

      return aggregateBars;
    } catch (error) {
      log.error(
        "[FastApiService] Failed to fetch historical bars",
        error instanceof Error ? error.message : String(error),
        "FastApiService"
      );
      throw error;
    }
  }
}

export const fastApiService = new FastApiService();
