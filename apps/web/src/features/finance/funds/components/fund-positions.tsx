/**
 * FundPositions Component
 *
 * Displays current positions for a fund with Alpaca validation.
 */

"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/lib/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import { Badge } from "@/lib/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";

interface AlpacaPosition {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pl: number;
  unrealized_plpc: number;
}

interface DatabasePosition {
  symbol: string;
  qty: number;
  source: string;
}

interface PositionsData {
  fund_id: string;
  fund_mode: string;
  is_running: boolean;
  alpaca_positions: AlpacaPosition[];
  database_positions: DatabasePosition[];
  sync_issues: {
    in_alpaca_not_db: string[];
    in_db_not_alpaca: string[];
  };
  has_sync_issues: boolean;
}

interface FundPositionsProps {
  fundId: string;
}

export function FundPositions({ fundId }: FundPositionsProps) {
  const [data, setData] = useState<PositionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/funds/${fundId}/positions`);
      if (!response.ok) throw new Error("Failed to fetch positions");
      const result: PositionsData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch positions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchPositions, 10000);
    return () => clearInterval(interval);
  }, [fundId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading positions...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Positions</p>
            <p className="text-sm">{error}</p>
            <Button onClick={fetchPositions} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Sync Issues Alert */}
      {data.has_sync_issues && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sync Issues Detected</AlertTitle>
          <AlertDescription>
            <div className="space-y-2 mt-2">
              {data.sync_issues.in_alpaca_not_db.length > 0 && (
                <div>
                  <p className="font-semibold">In Alpaca but not in Database:</p>
                  <p className="text-sm">{data.sync_issues.in_alpaca_not_db.join(", ")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These positions exist in Alpaca but have no transaction history. They may belong to a different fund.
                  </p>
                </div>
              )}
              {data.sync_issues.in_db_not_alpaca.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold">In Database but not in Alpaca:</p>
                  <p className="text-sm">{data.sync_issues.in_db_not_alpaca.join(", ")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These positions show as open in the database but don't exist in Alpaca. This indicates a sync problem.
                  </p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Fund Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fund Status</CardTitle>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Mode:</span>
                <Badge variant={data.fund_mode === "sim" ? "secondary" : "default"}>
                  {data.fund_mode.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={data.is_running ? "default" : "outline"}>
                  {data.is_running ? "Running" : "Stopped"}
                </Badge>
              </div>
              <Button onClick={fetchPositions} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Alpaca Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Alpaca Positions</CardTitle>
          <CardDescription>
            Current positions from Alpaca {data.fund_mode === "sim" ? "(Paper Trading)" : "(Live Trading)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.alpaca_positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No positions in Alpaca
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Avg Entry</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">Market Value</TableHead>
                    <TableHead className="text-right">Unrealized P&L</TableHead>
                    <TableHead className="text-right">P&L %</TableHead>
                    <TableHead>Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.alpaca_positions.map((position) => {
                    const inDb = data.database_positions.some(
                      (p) => p.symbol === position.symbol
                    );
                    return (
                      <TableRow key={position.symbol}>
                        <TableCell className="font-medium">{position.symbol}</TableCell>
                        <TableCell className="text-right">{position.qty}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(position.avg_entry_price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(position.current_price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(position.market_value)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            position.unrealized_pl >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(position.unrealized_pl)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            position.unrealized_plpc >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatPercent(position.unrealized_plpc)}
                        </TableCell>
                        <TableCell>
                          {inDb ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Synced</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">Not in DB</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Database Positions</CardTitle>
          <CardDescription>
            Positions calculated from transaction history
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.database_positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No positions in database
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.database_positions.map((position) => {
                    const inAlpaca = data.alpaca_positions.some(
                      (p) => p.symbol === position.symbol
                    );
                    return (
                      <TableRow key={position.symbol}>
                        <TableCell className="font-medium">{position.symbol}</TableCell>
                        <TableCell className="text-right">{position.qty}</TableCell>
                        <TableCell>
                          {inAlpaca ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Synced</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">Not in Alpaca</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

