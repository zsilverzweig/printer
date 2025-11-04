"use client";

import { NewsCard } from "@/features/finance/market/components/news-card";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { useEffect, useState } from "react";

interface NewsStats {
  date: string;
  total_articles: number;
  unique_tickers: number;
  ticker_counts: Record<string, number>;
  tags: Record<string, number>;
  categories: Record<string, number>;
  sample_article: any;
  all_fields: string[];
  diagnostics?: {
    articles_fetched: number;
    articles_matching_date: number;
    date_range_found: {
      earliest: string | null;
      latest: string | null;
    };
    target_date: string;
    api_filter_used?: boolean;
    active_filters?: string[];
    note?: string;
  };
}

export default function NewsTestPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [newsStats, setNewsStats] = useState<NewsStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsDate, setStatsDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [statsFilters, setStatsFilters] = useState({
    channels: "",
    tags: "",
    author: "",
    stocks: "",
    tickers: "",
  });
  const [rawNewsData, setRawNewsData] = useState<any[] | null>(null);
  const [rawNewsLoading, setRawNewsLoading] = useState(false);

  const handleLoadNews = () => {
    if (ticker.trim()) {
      setActiveTicker(ticker.toUpperCase().trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleLoadNews();
    }
  };

  const loadNewsStats = async () => {
    setStatsLoading(true);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      // Build query params
      const params = new URLSearchParams({
        date: statsDate,
        limit: "50000",
      });

      // Add filters if they have values
      if (statsFilters.channels.trim()) {
        params.append("channels", statsFilters.channels.trim());
      }
      if (statsFilters.tags.trim()) {
        params.append("tags", statsFilters.tags.trim());
      }
      if (statsFilters.author.trim()) {
        params.append("author", statsFilters.author.trim());
      }
      if (statsFilters.stocks.trim()) {
        params.append("stocks", statsFilters.stocks.trim());
      }
      if (statsFilters.tickers.trim()) {
        params.append("tickers", statsFilters.tickers.trim());
      }

      const response = await fetch(
        `${baseUrl}/api/news/stats?${params.toString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setNewsStats(data);
    } catch (error) {
      console.error("Error loading news stats:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadRawNews = async () => {
    if (!activeTicker) return;
    setRawNewsLoading(true);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      const response = await fetch(
        `${baseUrl}/api/news?ticker=${activeTicker}&limit=100&sort=published.desc`
      );
      if (!response.ok) throw new Error("Failed to fetch raw news");
      const data = await response.json();
      setRawNewsData(Array.isArray(data) ? data : data.results || []);
    } catch (error) {
      console.error("Error loading raw news:", error);
    } finally {
      setRawNewsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTicker) {
      loadRawNews();
    }
  }, [activeTicker]);

  const eventFilters = [
    "Earnings reports or financial announcements",
    "Product launches or major updates",
    "Leadership changes (CEO, CFO, etc.)",
    "Mergers, acquisitions, or partnerships",
    "Regulatory actions or legal issues",
    "Major contracts or deals",
    "Fundraising or capital events",
  ];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">News</h1>
        <p className="text-muted-foreground">
          Benzinga news analysis and exploration
        </p>
      </div>

      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
          <TabsTrigger value="stats">News Stats</TabsTrigger>
          <TabsTrigger value="filters">Event Filters</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-4">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Load News for Ticker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Enter ticker symbol (e.g., AAPL, TSLA, NVDA)"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                />
                <Button onClick={handleLoadNews} disabled={!ticker.trim()}>
                  Load News
                </Button>
              </div>

              <div className="mt-4 text-sm text-muted-foreground">
                <p>Quick test tickers:</p>
                <div className="flex gap-2 mt-2">
                  {["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "GNTA"].map(
                    (t) => (
                      <Button
                        key={t}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTicker(t);
                          setActiveTicker(t);
                        }}
                      >
                        {t}
                      </Button>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {activeTicker && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">
                  News Analysis for {activeTicker}
                </h2>
                <Button
                  variant="outline"
                  onClick={() => setActiveTicker(null)}
                  size="sm"
                >
                  Clear
                </Button>
              </div>

              <NewsCard ticker={activeTicker} />
            </div>
          )}

          {!activeTicker && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <p>Enter a ticker symbol above to load news analysis</p>
                  <p className="text-sm mt-2">
                    Check the Python server logs to see detailed Benzinga API
                    calls
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="raw-data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Raw Benzinga News Data</CardTitle>
            </CardHeader>
            <CardContent>
              {!activeTicker ? (
                <div className="text-center text-muted-foreground py-8">
                  <p>Load a ticker in the Analysis tab to see raw news data</p>
                </div>
              ) : rawNewsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Loading raw news...
                  </p>
                </div>
              ) : rawNewsData && rawNewsData.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {rawNewsData.length} articles for {activeTicker}
                  </div>
                  {rawNewsData.slice(0, 5).map((article, idx) => (
                    <Card key={idx} className="p-4">
                      <div className="space-y-2">
                        <div className="font-semibold">
                          {article.title || "No title"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {article.description ||
                            article.summary ||
                            "No description"}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {article.tickers && (
                            <Badge variant="outline">
                              Tickers:{" "}
                              {Array.isArray(article.tickers)
                                ? article.tickers.join(", ")
                                : article.tickers}
                            </Badge>
                          )}
                          {article.tags && (
                            <Badge variant="outline">
                              Tags:{" "}
                              {Array.isArray(article.tags)
                                ? article.tags.slice(0, 3).join(", ")
                                : article.tags}
                            </Badge>
                          )}
                          {article.categories && (
                            <Badge variant="outline">
                              Categories:{" "}
                              {Array.isArray(article.categories)
                                ? article.categories.join(", ")
                                : article.categories}
                            </Badge>
                          )}
                          {article.published_utc && (
                            <Badge variant="outline">
                              {new Date(article.published_utc).toLocaleString()}
                            </Badge>
                          )}
                        </div>
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer">
                            Show all fields (JSON)
                          </summary>
                          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-64">
                            {JSON.stringify(article, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </Card>
                  ))}
                  {rawNewsData.length > 5 && (
                    <div className="text-sm text-muted-foreground text-center">
                      ... and {rawNewsData.length - 5} more articles
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No raw news data found for {activeTicker}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily News Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <Input
                    type="date"
                    value={statsDate}
                    onChange={(e) => setStatsDate(e.target.value)}
                    className="flex-1"
                    placeholder="Select date"
                  />
                  <Button onClick={loadNewsStats} disabled={statsLoading}>
                    {statsLoading ? "Loading..." : "Load Stats"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Channels
                    </label>
                    <Input
                      type="text"
                      value={statsFilters.channels}
                      onChange={(e) =>
                        setStatsFilters({
                          ...statsFilters,
                          channels: e.target.value,
                        })
                      }
                      placeholder='e.g., "news", "Price Target"'
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Tags
                    </label>
                    <Input
                      type="text"
                      value={statsFilters.tags}
                      onChange={(e) =>
                        setStatsFilters({
                          ...statsFilters,
                          tags: e.target.value,
                        })
                      }
                      placeholder="e.g., earnings, merger"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Author
                    </label>
                    <Input
                      type="text"
                      value={statsFilters.author}
                      onChange={(e) =>
                        setStatsFilters({
                          ...statsFilters,
                          author: e.target.value,
                        })
                      }
                      placeholder="Author name"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Stocks
                    </label>
                    <Input
                      type="text"
                      value={statsFilters.stocks}
                      onChange={(e) =>
                        setStatsFilters({
                          ...statsFilters,
                          stocks: e.target.value,
                        })
                      }
                      placeholder="e.g., AAPL, TSLA"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs text-muted-foreground">
                      Tickers
                    </label>
                    <Input
                      type="text"
                      value={statsFilters.tickers}
                      onChange={(e) =>
                        setStatsFilters({
                          ...statsFilters,
                          tickers: e.target.value,
                        })
                      }
                      placeholder="e.g., AAPL, TSLA (alternative to stocks)"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>
                    All filters are optional. Use API server-side filtering for
                    better performance. Leave empty to see all news for the
                    selected date.
                  </p>
                </div>
              </div>

              {statsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Loading statistics...
                  </p>
                </div>
              ) : newsStats ? (
                <div className="space-y-6">
                  {newsStats.diagnostics && (
                    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="font-semibold text-sm">
                            Diagnostics
                          </div>
                          <div className="text-xs space-y-1 text-muted-foreground">
                            <div>
                              Articles fetched:{" "}
                              {newsStats.diagnostics.articles_fetched}
                            </div>
                            <div>
                              Articles matching date:{" "}
                              {newsStats.diagnostics.articles_matching_date}
                            </div>
                            {newsStats.diagnostics.api_filter_used !==
                              undefined && (
                              <div>
                                API server-side filtering:{" "}
                                {newsStats.diagnostics.api_filter_used ? (
                                  <span className="text-green-600 dark:text-green-400">
                                    ✓ Used
                                  </span>
                                ) : (
                                  <span className="text-yellow-600 dark:text-yellow-400">
                                    ✗ Fallback (client-side)
                                  </span>
                                )}
                              </div>
                            )}
                            {newsStats.diagnostics.active_filters &&
                              newsStats.diagnostics.active_filters.length >
                                0 && (
                                <div>
                                  Active filters:{" "}
                                  <span className="font-mono text-xs">
                                    {newsStats.diagnostics.active_filters.join(
                                      ", "
                                    )}
                                  </span>
                                </div>
                              )}
                            {newsStats.diagnostics.date_range_found
                              .earliest && (
                              <div>
                                Date range in fetched data:{" "}
                                {
                                  newsStats.diagnostics.date_range_found
                                    .earliest
                                }{" "}
                                to{" "}
                                {newsStats.diagnostics.date_range_found.latest}
                              </div>
                            )}
                            {newsStats.diagnostics.note && (
                              <div className="mt-2 p-2 bg-background rounded text-orange-700 dark:text-orange-400">
                                {newsStats.diagnostics.note}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {newsStats.total_articles}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Total Articles
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {newsStats.unique_tickers}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Unique Tickers
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">
                          {newsStats.date}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Date
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">
                      Top Tickers by News Count
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(newsStats.ticker_counts)
                        .slice(0, 20)
                        .map(([ticker, count]) => (
                          <Badge key={ticker} variant="outline">
                            {ticker}: {count}
                          </Badge>
                        ))}
                    </div>
                  </div>

                  {Object.keys(newsStats.tags).length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(newsStats.tags).map(([tag, count]) => (
                          <Badge key={tag} variant="secondary">
                            {tag}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(newsStats.categories).length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Categories</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(newsStats.categories).map(
                          ([cat, count]) => (
                            <Badge key={cat} variant="secondary">
                              {cat}: {count}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {newsStats.sample_article && (
                    <div>
                      <h3 className="font-semibold mb-2">
                        Sample Article Structure
                      </h3>
                      <details>
                        <summary className="text-sm text-muted-foreground cursor-pointer">
                          Click to view sample article
                        </summary>
                        <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-auto max-h-96">
                          {JSON.stringify(newsStats.sample_article, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}

                  {newsStats.all_fields && newsStats.all_fields.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">
                        All Available Fields
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {newsStats.all_fields.map((field) => (
                          <Badge
                            key={field}
                            variant="outline"
                            className="text-xs"
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Select a date and click "Load Stats" to view news statistics
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Extraction Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The AI analyzes news articles and extracts key events based on
                  the following criteria:
                </p>
                <div className="space-y-2">
                  {eventFilters.map((filter, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground mt-1">•</span>
                      <span className="text-sm">{filter}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2 text-sm">How it works:</h4>
                  <p className="text-xs text-muted-foreground">
                    When you request news analysis for a ticker, the system:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 mt-2 text-xs text-muted-foreground">
                    <li>
                      Fetches recent Benzinga news articles for the ticker
                    </li>
                    <li>Sends them to the AI with the above filter criteria</li>
                    <li>AI extracts events matching these categories</li>
                    <li>
                      Returns structured event data with summaries and URLs
                    </li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
