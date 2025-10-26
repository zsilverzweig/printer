import * as React from "react";

import { fastApiService } from "@/lib/services/fast-api-service";
import type { NewsArticle } from "@/lib/types/market";

import { normalizeNewsArticles } from "../utils/news-utils";

export function useStockNews(symbol: string, limit = 20) {
  const [news, setNews] = React.useState<NewsArticle[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isCancelled = false;
    const loadNews = async () => {
      setLoading(true);
      setError(null);
      try {
        const rawArticles = await fastApiService.getNews(symbol, limit);
        const normalizedArticles = normalizeNewsArticles(rawArticles);
        if (!isCancelled) setNews(normalizedArticles);
      } catch (e) {
        if (!isCancelled)
          setError(e instanceof Error ? e.message : "Failed to load news");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void loadNews();
    return () => {
      isCancelled = true;
    };
  }, [symbol, limit]);

  return { news, loading, error } as const;
}
