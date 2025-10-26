"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { LastTradeCard } from "@/features/finance/market/components/LastTradeCard";
import { PriceCard } from "@/features/finance/market/components/PriceCard";
import { RealtimePanel } from "@/features/finance/market/components/RealtimePanel";
import { TickerControls } from "@/features/finance/market/components/TickerControls";
import { useStockData } from "@/features/finance/market/hooks/use-stock-data";
import { useStockNews } from "@/features/finance/market/hooks/use-stock-news";
import { useStockRealtime } from "@/features/finance/market/hooks/use-stock-realtime";
import NewsPanel from "@/lib/components/ui/news-list";
import type { Timespan } from "@/lib/types/market";

export default function StockPage({ params }: { params: { symbol: string } }) {
  const symbol = (params.symbol || "AAPL").toUpperCase();
  const router = useRouter();

  const [timespan, setTimespan] = React.useState<Timespan>("day");
  const [multiplier, setMultiplier] = React.useState<number>(1);
  const { aggs, lastTrade, loading, error, chartPoints } = useStockData({
    symbol,
    timespan,
    multiplier,
  });
  const { news, loading: newsLoading, error: newsError } = useStockNews(symbol);
  const {
    isConnected,
    isConnecting,
    lastEvent,
    error: wsError,
  } = useStockRealtime(symbol);

  return (
    <div className="container mx-auto p-6">
      <TickerControls
        symbol={symbol}
        onSubmitSymbol={(s) => router.push(`/stocks/${encodeURIComponent(s)}`)}
        timespan={timespan}
        onTimespanChange={setTimespan}
        multiplier={multiplier}
        onMultiplierChange={setMultiplier}
      />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <PriceCard aggs={aggs} chartPoints={chartPoints} loading={loading} />

      <div className="mt-6">
        <NewsPanel
          title={`${symbol} News`}
          articles={news}
          loading={newsLoading}
          error={newsError}
        />
      </div>

      <RealtimePanel
        isConnected={isConnected}
        isConnecting={isConnecting}
        lastEvent={lastEvent}
        error={wsError}
      />

      <LastTradeCard lastTrade={lastTrade} />
    </div>
  );
}
