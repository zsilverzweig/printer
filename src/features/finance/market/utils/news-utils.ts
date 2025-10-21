import type { NewsArticle } from "@/lib/types/market";

/**
 * Normalizes raw news data from Polygon API into NewsArticle format
 */
export function normalizeNewsArticles(rawItems: unknown[]): NewsArticle[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((raw): NewsArticle | null => {
      if (!isObject(raw)) return null;

      const obj = raw as Record<string, unknown>;
      const publisherObj = isObject(obj["publisher"])
        ? (obj["publisher"] as Record<string, unknown>)
        : undefined;

      const id =
        asString(obj["id"]) ||
        asString(obj["uuid"]) ||
        asString(obj["article_url"]) ||
        asString(obj["url"]) ||
        generateId();

      const title = asString(obj["title"]) || "";
      const description =
        asString(obj["description"]) || asString(obj["summary"]) || "";
      const url = asString(obj["url"]) || asString(obj["article_url"]) || "";
      const source =
        asString(obj["source"]) ||
        (publisherObj ? asString(publisherObj["name"]) : undefined) ||
        "";
      const imageUrl =
        asString(obj["imageUrl"]) || asString(obj["image_url"]) || undefined;
      const publishedUtc =
        asString(obj["publishedUtc"]) ||
        asString(obj["published_utc"]) ||
        asString(obj["published_at"]) ||
        "";
      const tickers =
        asStringArray(obj["tickers"]) || asStringArray(obj["symbols"]);

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
    .filter((article): article is NewsArticle => article !== null);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function generateId(): string {
  try {
    const g: unknown = globalThis as unknown;
    if (
      isObject(g) &&
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
