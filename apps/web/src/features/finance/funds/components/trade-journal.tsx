/**
 * Trade Journal Component
 *
 * Detailed trade-by-trade breakdown with expandable rows showing full context.
 */

"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

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

import {
  analyticsService,
  TradeDetail,
  TradeRecord,
} from "../services/analytics-service";

interface TradeJournalProps {
  fundId?: string;
  symbol?: string;
  screeningCriteriaId?: string;
}

export function TradeJournal({
  fundId,
  symbol,
  screeningCriteriaId,
}: TradeJournalProps) {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [tradeDetails, setTradeDetails] = useState<Record<string, TradeDetail>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrades = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await analyticsService.getTrades({
        fund_id: fundId,
        symbol,
        screening_criteria_id: screeningCriteriaId,
        status: "closed",
        limit: 100,
      });

      setTrades(result.trades);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load trade journal"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrades();
  }, [fundId, symbol, screeningCriteriaId]);

  const loadTradeDetails = async (tradeId: string) => {
    if (tradeDetails[tradeId]) {
      // Already loaded
      return;
    }

    try {
      const detail = await analyticsService.getTradeDetail(tradeId);
      setTradeDetails((prev) => ({ ...prev, [tradeId]: detail }));
    } catch (err) {
      console.error("Failed to load trade details:", err);
    }
  };

  const toggleExpand = async (tradeId: string) => {
    if (expandedTrade === tradeId) {
      setExpandedTrade(null);
    } else {
      setExpandedTrade(tradeId);
      await loadTradeDetails(tradeId);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Trade ID",
      "Symbol",
      "Entry Time",
      "Exit Time",
      "Entry Price",
      "Exit Price",
      "Quantity",
      "Hold Duration (min)",
      "P&L",
      "P&L %",
      "Strategy",
      "Pattern",
    ];

    const rows = trades.map((trade) => [
      trade.id,
      trade.symbol,
      trade.entry_time,
      trade.exit_time || "",
      trade.entry_price.toFixed(2),
      trade.exit_price?.toFixed(2) || "",
      trade.entry_quantity.toFixed(2),
      trade.hold_duration_seconds
        ? (trade.hold_duration_seconds / 60).toFixed(1)
        : "",
      trade.realized_pnl?.toFixed(2) || "",
      trade.realized_pnl_percent?.toFixed(2) || "",
      trade.strategy_id || "",
      trade.screening_criteria_id || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-journal-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading trade journal...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Trades</p>
            <p className="text-sm">{error}</p>
            <Button onClick={loadTrades} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Trade Journal</CardTitle>
            <CardDescription>
              Detailed breakdown of all completed trades
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={trades.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={loadTrades}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No closed trades yet. Execute trades to see journal entries.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Entry Price</TableHead>
                  <TableHead className="text-right">Exit Price</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">P&L %</TableHead>
                  <TableHead>Strategy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => {
                  const isExpanded = expandedTrade === trade.id;
                  const detail = tradeDetails[trade.id];
                  const isWin =
                    trade.realized_pnl !== null && trade.realized_pnl > 0;

                  return (
                    <>
                      <TableRow
                        key={trade.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(trade.id)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {trade.symbol}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(trade.entry_time)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {trade.exit_time
                            ? formatDateTime(trade.exit_time)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatDuration(trade.hold_duration_seconds)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(trade.entry_price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {trade.exit_price
                            ? formatCurrency(trade.exit_price)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {trade.entry_quantity.toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            isWin ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {trade.realized_pnl !== null ? (
                            <>
                              {isWin ? (
                                <TrendingUp className="inline h-3 w-3 mr-1" />
                              ) : (
                                <TrendingDown className="inline h-3 w-3 mr-1" />
                              )}
                              {formatCurrency(trade.realized_pnl)}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            isWin ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {trade.realized_pnl_percent !== null
                            ? `${
                                trade.realized_pnl_percent > 0 ? "+" : ""
                              }${trade.realized_pnl_percent.toFixed(2)}%`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {trade.strategy_id || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-muted/30 p-4">
                            {detail ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <div className="text-xs text-muted-foreground">
                                      Trade ID
                                    </div>
                                    <div className="text-sm font-mono">
                                      {trade.id.slice(0, 8)}...
                                    </div>
                                  </div>
                                  {detail.ai_confidence !== null && (
                                    <div>
                                      <div className="text-xs text-muted-foreground">
                                        AI Confidence
                                      </div>
                                      <div className="text-sm font-semibold">
                                        {(detail.ai_confidence * 100).toFixed(
                                          0
                                        )}
                                        %
                                      </div>
                                    </div>
                                  )}
                                  {detail.max_favorable_excursion !== null && (
                                    <div>
                                      <div className="text-xs text-muted-foreground">
                                        Max Gain (MFE)
                                      </div>
                                      <div className="text-sm font-semibold text-green-600">
                                        {formatCurrency(
                                          detail.max_favorable_excursion
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {detail.max_adverse_excursion !== null && (
                                    <div>
                                      <div className="text-xs text-muted-foreground">
                                        Max Loss (MAE)
                                      </div>
                                      <div className="text-sm font-semibold text-red-600">
                                        {formatCurrency(
                                          detail.max_adverse_excursion
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {detail.ai_reasoning && (
                                  <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-2">
                                      AI Reasoning
                                    </div>
                                    <div className="text-sm bg-background p-3 rounded-md border">
                                      {detail.ai_reasoning}
                                    </div>
                                  </div>
                                )}

                                {detail.screening_criteria_id && (
                                  <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">
                                      Pattern/Setup
                                    </div>
                                    <Badge>
                                      {detail.screening_criteria_id}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                Loading details...
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
