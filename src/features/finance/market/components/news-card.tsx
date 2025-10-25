"use client";

import { Clock, ExternalLink, RefreshCw, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { CardActionButton } from "@/lib/components/ui/card-action-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { formatET, formatETTime, useTimeSince } from "@/lib/utils/date-time";

interface KeyEvent {
  event_id: string;
  name: string;
  summary: string;
  url: string;
  published_at: string;
  event_at: string;
}

interface NewsAnalysisData {
  ticker: string;
  analyzed_at: string;
  key_events: KeyEvent[];
  news_summary: string;
  trade_recommendation: string;
  raw_news: Array<{
    title: string;
    description?: string;
    url?: string;
    article_url?: string;
    published_utc?: string;
    publisher?: { name?: string };
    author?: string;
  }>;
}

interface NewsCardProps {
  ticker: string;
  onNewsLoad?: (data: NewsAnalysisData) => void;
}

// Simple in-memory cache for news data
const newsCache = new Map<
  string,
  { data: NewsAnalysisData; timestamp: number }
>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function NewsCard({ ticker, onNewsLoad }: NewsCardProps) {
  const [newsData, setNewsData] = useState<NewsAnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [dateRange, setDateRange] = useState<"24h" | "48h" | "7d" | "30d">(
    "7d"
  );

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const loadNews = useCallback(async (forceRefresh = false) => {
    // Check cache first
    const cached = newsCache.get(`${ticker}-${dateRange}`);
    const now = Date.now();

    if (!forceRefresh && cached && now - cached.timestamp < CACHE_DURATION) {
      setNewsData(cached.data);
      onNewsLoad?.(cached.data);
      setIsInitialLoad(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      // Map date ranges to days
      const daysMap = { "24h": 1, "48h": 2, "7d": 7, "30d": 30 };
      const days = daysMap[dateRange];

      // Add timeout to prevent blocking
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(
        `${baseUrl}/news/analyze/${ticker}?days=${days}`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch news analysis: ${response.statusText}`
        );
      }

      const data = await response.json();

      // Cache the data with dateRange in key
      newsCache.set(`${ticker}-${dateRange}`, { data, timestamp: now });

      setNewsData(data);
      onNewsLoad?.(data);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setError(
          "Request timed out. News analysis is taking longer than expected."
        );
      } else {
        setError(
          error instanceof Error ? error.message : "Failed to load news"
        );
      }
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [ticker, dateRange, onNewsLoad]);

  // Auto-load news when ticker or dateRange changes
  useEffect(() => {
    if (ticker) {
      // Reset state for new ticker or date range
      setNewsData(null);
      setError(null);
      setIsInitialLoad(true);

      // Load news asynchronously without blocking
      loadNews();
    }
  }, [ticker, loadNews]);

  if (isLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            News Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <div className="text-sm text-muted-foreground text-center">
              {isInitialLoad
                ? "Loading news analysis..."
                : "Refreshing news..."}
            </div>
            <div className="text-xs text-muted-foreground text-center">
              This may take a moment
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            News Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="space-y-3">
            <div className="text-sm text-destructive text-center">{error}</div>
            <div className="flex flex-col space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadNews()}
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Retrying..." : "Retry"}
              </Button>
              <div className="text-xs text-muted-foreground text-center">
                News analysis may take time for some stocks
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!newsData) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            News Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">
            No news data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="space-y-2">
          <CardTitle className="flex items-center justify-between text-base">
            <div>News Analysis</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {formatDate(newsData.analyzed_at)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadNews(true)}
                disabled={isLoading}
                className="h-6 w-6 p-0"
                title="Refresh news"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardTitle>

          {/* Date Range Selector */}
          <div className="flex gap-1">
            {(["24h", "48h", "7d", "30d"] as const).map((range) => (
              <CardActionButton
                key={range}
                variant={dateRange === range ? "default" : "outline"}
                onClick={() => setDateRange(range)}
                disabled={isLoading}
              >
                {range}
              </CardActionButton>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto">
        {/* News Summary */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Summary</h4>
          <p className="text-xs text-muted-foreground line-clamp-3">
            {newsData.news_summary}
          </p>
        </div>

        {/* Trade Recommendation */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Analysis</h4>
          <div className="bg-muted p-3 rounded-lg max-h-60 overflow-y-auto">
            <p className="text-xs whitespace-pre-wrap leading-relaxed">
              {typeof newsData.trade_recommendation === "string"
                ? newsData.trade_recommendation
                : JSON.stringify(newsData.trade_recommendation, null, 2)}
            </p>
          </div>
        </div>

        {/* Key Events */}
        {newsData.key_events && newsData.key_events.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Key Events ({newsData.key_events.length})
            </h4>
            <div className="space-y-2">
              {newsData.key_events.map((event) => (
                <div
                  key={event.event_id}
                  className="border rounded-lg p-3 text-xs hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h5 className="font-semibold text-sm flex-1">
                      {event.name}
                    </h5>
                    {event.url && event.url !== "No URL" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(event.url, "_blank")}
                        className="h-6 w-6 p-0 shrink-0"
                        title="Read article"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <p className="text-muted-foreground leading-relaxed mb-2">
                    {event.summary}
                  </p>

                  <EventTiming
                    publishedUtc={event.published_at}
                    eventUtc={event.event_at}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Key Events</h4>
            <div className="text-xs text-muted-foreground p-3 bg-muted rounded-lg text-center">
              No significant events identified in recent news
            </div>
          </div>
        )}

        {/* Raw News List */}
        {newsData.raw_news && newsData.raw_news.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Recent Articles ({newsData.raw_news.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {newsData.raw_news.map((article, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-2 text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h5 className="font-medium text-xs mb-1 line-clamp-2">
                        {article.title}
                      </h5>
                      {article.description && (
                        <p className="text-muted-foreground text-xs line-clamp-2 mb-1">
                          {article.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{article.publisher?.name || "Unknown"}</span>
                        <span>•</span>
                        <span>{formatDate(article.published_utc || "")}</span>
                      </div>
                    </div>
                    {(article.url || article.article_url) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(
                            article.url || article.article_url,
                            "_blank"
                          )
                        }
                        className="h-6 w-6 p-0 shrink-0"
                        title="Read article"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventTiming({
  publishedUtc,
  eventUtc,
}: {
  publishedUtc: string;
  eventUtc: string;
}) {
  // Prefer event time; fall back to published time
  const displayUtc = eventUtc || publishedUtc;
  const since = useTimeSince(displayUtc);
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <div className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        <span>ET {formatETTime(displayUtc)}</span>
        <span>•</span>
        <span>{formatET(displayUtc)}</span>
        {since && (
          <>
            <span>•</span>
            <span>{since}</span>
          </>
        )}
      </div>
    </div>
  );
}
