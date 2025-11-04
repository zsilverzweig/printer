/**
 * Backtests Page
 *
 * Main page for backtest management.
 */

"use client";

import { Loader2 } from "lucide-react";

import { BacktestManagement } from "@/features/research/backtests";
import { useAuthContext } from "@/lib/providers/auth-provider";

export default function BacktestsPage() {
  const { isAuthenticated, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-muted-foreground">
            Please sign in to access backtest management.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <BacktestManagement />
    </div>
  );
}
