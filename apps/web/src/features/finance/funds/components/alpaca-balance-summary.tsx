/**
 * AlpacaBalanceSummary Component
 *
 * Displays Alpaca account balances with allocated/available breakdown
 * for both paper and real trading accounts.
 */

"use client";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { useEffect, useState } from "react";

interface AccountBalance {
  balance: number;
  allocated: number;
  available: number;
  allocated_percent: number;
}

interface AlpacaAccountSummary {
  paper: AccountBalance;
  real: AccountBalance;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AlpacaBalanceSummary() {
  const [summary, setSummary] = useState<AlpacaAccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE}/api/trading/alpaca/account-summary`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch Alpaca account summary");
        }

        const data = await response.json();
        setSummary(data);
      } catch (err) {
        console.error("Error fetching Alpaca summary:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load balances"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();

    // Auto-refresh disabled to prevent losing user's place while editing
    // const interval = setInterval(fetchSummary, 30000);
    // return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent.toFixed(1)}%`;
  };

  if (loading && !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alpaca Accounts</CardTitle>
          <CardDescription>Loading account balances...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alpaca Accounts</CardTitle>
          <CardDescription className="text-red-600">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alpaca Accounts</CardTitle>
        <CardDescription>
          Total balances and fund allocations across trading accounts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Paper Trading Account */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">📊 Paper Trading</span>
              {summary.paper.balance === 0 && (
                <Badge variant="outline" className="text-xs">
                  Not Configured
                </Badge>
              )}
            </div>
          </div>
          {summary.paper.balance > 0 && (
            <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted p-3">
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-sm font-semibold">
                  {formatCurrency(summary.paper.balance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Allocated</p>
                <p className="text-sm font-semibold">
                  {formatCurrency(summary.paper.allocated)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({formatPercent(summary.paper.allocated_percent)})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-sm font-semibold">
                  {formatCurrency(summary.paper.available)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Real Trading Account */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">💰 Real Trading</span>
              {summary.real.balance === 0 && (
                <Badge variant="outline" className="text-xs">
                  Not Configured
                </Badge>
              )}
            </div>
          </div>
          {summary.real.balance > 0 && (
            <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted p-3">
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-sm font-semibold">
                  {formatCurrency(summary.real.balance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Allocated</p>
                <p className="text-sm font-semibold">
                  {formatCurrency(summary.real.allocated)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({formatPercent(summary.real.allocated_percent)})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-sm font-semibold">
                  {formatCurrency(summary.real.available)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Warning if over-allocated */}
        {(summary.paper.available < 0 || summary.real.available < 0) && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ Warning: Funds allocated exceed Alpaca balance
          </div>
        )}
      </CardContent>
    </Card>
  );
}
