/**
 * FundPositions Component
 *
 * Displays current positions for a fund with Alpaca validation.
 */

"use client";

import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/lib/components/ui/alert-dialog";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

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

interface CloseOrphanedPositionButtonProps {
  fundId: string;
  symbol: string;
  onSuccess: () => void;
}

function CloseOrphanedPositionButton({
  fundId,
  symbol,
  onSuccess,
}: CloseOrphanedPositionButtonProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const handleClose = async () => {
    try {
      setIsClosing(true);
      setError(null);

      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/positions/${symbol}/close-orphaned`,
        { method: "POST" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to close position");
      }

      const result = await response.json();
      console.log("Position closed:", result);

      // Show success message with details
      if (result.price_source === "alpaca_order") {
        console.log(
          `✅ Found Alpaca order! Exit price: $${result.exit_price.toFixed(
            2
          )}, ` + `P&L: $${result.realized_pl.toFixed(2)}`
        );
      } else {
        console.log(
          `⚠️  Using breakeven price (no matching Alpaca order found)`
        );
      }

      // Close dialog and refresh positions
      setShowDialog(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close position");
      console.error("Error closing position:", err);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <>
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Close Out
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Close Orphaned Position?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will create a closing transaction for{" "}
                <strong>{symbol}</strong> to zero out the position in the
                database.
              </p>
              <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3 text-sm space-y-2">
                <p className="font-semibold text-orange-900 dark:text-orange-200">
                  What this does:
                </p>
                <ul className="list-disc list-inside space-y-1 text-orange-800 dark:text-orange-300">
                  <li>
                    Creates a matching sell transaction to close the database
                    position
                  </li>
                  <li>
                    Finds the matching Alpaca sell order to get the actual exit
                    price
                  </li>
                  <li>
                    If no matching order found, uses the average entry price
                    (breakeven)
                  </li>
                  <li>Returns the sale proceeds to your fund balance</li>
                  <li>Leaves an audit trail in your transaction history</li>
                </ul>
              </div>
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">
                  Why use this?
                </p>
                <p className="text-blue-800 dark:text-blue-300">
                  This position exists in your database but not in Alpaca. This
                  usually happens when a position was sold in Alpaca but the
                  sync failed, or it was manually closed outside the trading
                  system.
                </p>
              </div>
              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
                  <p className="font-semibold mb-1">Error:</p>
                  <p>{error}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleClose();
              }}
              disabled={isClosing}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isClosing ? "Closing..." : "Close Position"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function FundPositions({ fundId }: FundPositionsProps) {
  const [data, setData] = useState<PositionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/positions`
      );
      if (!response.ok) throw new Error("Failed to fetch positions");
      const result: PositionsData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch positions"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    // Auto-refresh disabled to prevent losing user's place while editing
    // const interval = setInterval(fetchPositions, 10000);
    // return () => clearInterval(interval);
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
                  <p className="font-semibold">
                    In Alpaca but not in Database:
                  </p>
                  <p className="text-sm">
                    {data.sync_issues.in_alpaca_not_db.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These positions exist in Alpaca but have no transaction
                    history. They may belong to a different fund.
                  </p>
                </div>
              )}
              {data.sync_issues.in_db_not_alpaca.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold">
                    In Database but not in Alpaca:
                  </p>
                  <p className="text-sm">
                    {data.sync_issues.in_db_not_alpaca.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These positions show as open in the database but don't exist
                    in Alpaca. This indicates a sync problem.
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
                <Badge
                  variant={data.fund_mode === "sim" ? "secondary" : "default"}
                >
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
            Current positions from Alpaca{" "}
            {data.fund_mode === "sim" ? "(Paper Trading)" : "(Live Trading)"}
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
                        <TableCell className="font-medium">
                          {position.symbol}
                        </TableCell>
                        <TableCell className="text-right">
                          {position.qty}
                        </TableCell>
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
                            position.unrealized_pl >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(position.unrealized_pl)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            position.unrealized_plpc >= 0
                              ? "text-green-600"
                              : "text-red-600"
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.database_positions.map((position) => {
                    const inAlpaca = data.alpaca_positions.some(
                      (p) => p.symbol === position.symbol
                    );
                    return (
                      <TableRow key={position.symbol}>
                        <TableCell className="font-medium">
                          {position.symbol}
                        </TableCell>
                        <TableCell className="text-right">
                          {position.qty}
                        </TableCell>
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
                        <TableCell className="text-right">
                          {!inAlpaca && (
                            <CloseOrphanedPositionButton
                              fundId={fundId}
                              symbol={position.symbol}
                              onSuccess={fetchPositions}
                            />
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
