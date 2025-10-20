import { ApiService } from "@/lib/services/api-service";
import type {
  AggregateBar,
  GetAggsParams,
  LastTrade,
  NewsArticle,
} from "@/lib/types/market";

// Default to Next.js server-side proxy to avoid CORS in the browser
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_MARKET_API_BASE_URL || "";

export class MarketService {
  private api: ApiService;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.api = new ApiService(baseUrl);
  }

  private static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private static asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private static asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  }

  private static generateId(): string {
    try {
      const g: unknown = globalThis as unknown;
      if (
        MarketService.isObject(g) &&
        typeof (g as Record<string, unknown>).crypto === "object" &&
        (g as any).crypto &&
        typeof (g as any).crypto.randomUUID === "function"
      ) {
        return (g as any).crypto.randomUUID();
      }
    } catch {
      // ignore and fall back
    }
    return `news_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

  async getNews(ticker: string, limit = 20): Promise<NewsArticle[]> {
    const query = new URLSearchParams({
      ticker: ticker.toUpperCase(),
      limit: String(limit),
    });
    const res = await this.api.get<unknown>(`/news?${query.toString()}`);

    let items: unknown[] = [];
    if (Array.isArray(res)) {
      items = res as unknown[];
    } else if (MarketService.isObject(res)) {
      const obj = res as Record<string, unknown>;
      const maybeArticles = obj["articles"];
      const maybeResults = obj["results"];
      if (Array.isArray(maybeArticles)) {
        items = maybeArticles as unknown[];
      } else if (Array.isArray(maybeResults)) {
        items = maybeResults as unknown[];
      }
    }

    const normalized: NewsArticle[] = items
      .map((raw): NewsArticle | null => {
        if (!MarketService.isObject(raw)) return null;
        const obj = raw as Record<string, unknown>;
        const publisherObj = MarketService.isObject(obj["publisher"])
          ? (obj["publisher"] as Record<string, unknown>)
          : undefined;

        const id =
          MarketService.asString(obj["id"]) ||
          MarketService.asString(obj["uuid"]) ||
          MarketService.asString(obj["article_url"]) ||
          MarketService.asString(obj["url"]) ||
          MarketService.generateId();

        const title = MarketService.asString(obj["title"]) || "";
        const description =
          MarketService.asString(obj["description"]) ||
          MarketService.asString(obj["summary"]) ||
          "";
        const url =
          MarketService.asString(obj["url"]) ||
          MarketService.asString(obj["article_url"]) ||
          "";
        const source =
          MarketService.asString(obj["source"]) ||
          (publisherObj
            ? MarketService.asString(publisherObj["name"])
            : undefined) ||
          "";
        const imageUrl =
          MarketService.asString(obj["imageUrl"]) ||
          MarketService.asString(obj["image_url"]) ||
          undefined;
        const publishedUtc =
          MarketService.asString(obj["publishedUtc"]) ||
          MarketService.asString(obj["published_utc"]) ||
          MarketService.asString(obj["published_at"]) ||
          "";
        const tickers =
          MarketService.asStringArray(obj["tickers"]) ||
          MarketService.asStringArray(obj["symbols"]);

        return {
          id,
          title,
          description,
          url,
          source,
          imageUrl,
          publishedUtc,
          tickers,
        };
      })
      .filter((a): a is NewsArticle => a !== null);

    return normalized;
  }
}

export const marketService = new MarketService();
