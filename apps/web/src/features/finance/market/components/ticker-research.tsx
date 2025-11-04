"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";

import { NewsCard } from "./news-card";
import { NocRealtimeChart } from "./noc-realtime-chart";

interface TickerResearchProps {
  initialTicker?: string;
}

// Store recent tickers in localStorage
const RECENT_TICKERS_KEY = "recent-tickers";
const MAX_RECENT_TICKERS = 10;

function getRecentTickers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_TICKERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentTicker(ticker: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentTickers();
    // Remove if already exists and add to front
    const filtered = recent.filter((t) => t !== ticker);
    const updated = [ticker, ...filtered].slice(0, MAX_RECENT_TICKERS);
    localStorage.setItem(RECENT_TICKERS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save recent ticker:", error);
  }
}

/**
 * Ticker Research Component
 * Displays real-time chart and news for any ticker
 */
export function TickerResearch({ initialTicker }: TickerResearchProps) {
  const router = useRouter();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(
    initialTicker ?? null
  );
  const [tickerInput, setTickerInput] = useState("");
  const [recentTickers, setRecentTickers] = useState<string[]>([]);

  // Load recent tickers on mount
  useEffect(() => {
    setRecentTickers(getRecentTickers());
  }, []);

  // Update recent tickers when ticker changes
  useEffect(() => {
    if (selectedTicker) {
      addRecentTicker(selectedTicker);
      setRecentTickers(getRecentTickers());
    }
  }, [selectedTicker]);

  const handleTickerSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    router.push(`/ticker?ticker=${ticker}`, { scroll: false });
  };

  const handleTickerInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();
    if (ticker) {
      handleTickerSelect(ticker);
      setTickerInput("");
    }
  };

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-3xl font-bold mb-4">Stock Research</h1>

        {/* Ticker Input Search */}
        <form onSubmit={handleTickerInputSubmit} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Enter ticker symbol (e.g., AAPL, TSLA)..."
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              className="pl-10"
            />
          </div>
        </form>

        {/* Recent Tickers */}
        {recentTickers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Recent:</span>
            <div className="flex gap-2 flex-wrap">
              {recentTickers.map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => handleTickerSelect(ticker)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    selectedTicker === ticker
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80"
                  }`}
                >
                  {ticker}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6">
        {selectedTicker ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 h-full">
            {/* Chart - Takes up 2/3 of the space */}
            <div className="lg:col-span-2 h-full min-h-[500px]">
              <NocRealtimeChart
                symbol={selectedTicker}
                onSymbolChange={(newSymbol) => handleTickerSelect(newSymbol)}
              />
            </div>

            {/* News Card - Takes up 1/3 of the space */}
            <div className="lg:col-span-1 h-full">
              <NewsCard ticker={selectedTicker} />
            </div>
          </div>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="text-lg mb-2">Enter a ticker symbol to begin</p>
              <p className="text-sm">
                Type a symbol above or select from your recent tickers
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
