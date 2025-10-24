"use client";

import { useState } from "react";
import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/lib/components/ui/card";
import { NewsCard } from "@/features/finance/market/components/news-card";

export default function NewsTestPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

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

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">News Test Page</h1>
        <p className="text-muted-foreground">
          Quick test interface for Benzinga news analysis
        </p>
      </div>

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
              {["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "GNTA"].map((t) => (
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
              ))}
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
                Check the Python server logs to see detailed Benzinga API calls
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

