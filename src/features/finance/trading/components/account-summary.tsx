"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { AlpacaAccount } from "@/lib/types/alpaca";

interface AccountSummaryProps {
  account: AlpacaAccount | null;
  loading: boolean;
}

export function AccountSummary({ account, loading }: AccountSummaryProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Overview</CardTitle>
          <CardDescription>
            Monitor buying power, equity, and account status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Overview</CardTitle>
          <CardDescription>
            Monitor buying power, equity, and account status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">
              No account data available
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const accountCurrency = account.currency || "USD";
  const buyingPower = Number(account.buying_power) || 0;
  const cash = Number(account.cash) || 0;
  const equity = Number(account.equity) || 0;
  const portfolioValue = Number(account.portfolio_value) || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Account Overview</CardTitle>
            <CardDescription>
              Monitor buying power, equity, and account status.
            </CardDescription>
          </div>
          <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            ACTIVE
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Buying Power</p>
            <p className="text-2xl font-bold">
              {formatCurrency(buyingPower, accountCurrency)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Cash</p>
            <p className="text-2xl font-bold">
              {formatCurrency(cash, accountCurrency)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Equity</p>
            <p className="text-2xl font-bold">
              {formatCurrency(equity, accountCurrency)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Portfolio Value</p>
            <p className="text-2xl font-bold">
              {formatCurrency(portfolioValue, accountCurrency)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">SHORTING ENABLED</p>
            <p className="font-medium">
              {account.trading_blocked ? "No" : "Yes"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">MULTIPLIER</p>
            <p className="font-medium">1</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">PATTERN DAY TRADER</p>
            <p className="font-medium">
              {account.pattern_day_trader ? "Yes" : "No"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">TRADING BLOCKED</p>
            <p className="font-medium">
              {account.trading_blocked ? "Yes" : "No"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
