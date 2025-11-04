"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { TickerResearch } from "@/features/finance/market/components/ticker-research";
import { useAuthContext } from "@/lib/providers/auth-provider";

/**
 * Ticker Research page content with URL parameter support
 */
function TickerPageContent() {
  const { isAuthenticated } = useAuthContext();
  const searchParams = useSearchParams();
  const tickerFromUrl = searchParams.get("ticker");

  if (!isAuthenticated) {
    return (
      <div className="w-full h-screen p-6 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-muted-foreground">
            Please sign in to access stock research.
          </p>
        </div>
      </div>
    );
  }

  return <TickerResearch initialTicker={tickerFromUrl || undefined} />;
}

/**
 * Ticker Research Page
 *
 * Allows users to research individual stocks with real-time charts and news.
 */
export default function TickerPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen p-6 flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <TickerPageContent />
    </Suspense>
  );
}
