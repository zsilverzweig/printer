"use client";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import type { TradingActivityEvent } from "@/lib/types/websocket";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  Hash,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";

// Simple time ago formatter
function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TradingActivityFeedProps {
  fundId?: string;
  maxItems?: number;
}

export function TradingActivityFeed({
  fundId,
  maxItems = 50,
}: TradingActivityFeedProps) {
  const { tradingActivity, isConnected } = useWebSocketContext();

  // Filter by fund if fundId is provided
  const filteredActivity = useMemo(() => {
    let events = tradingActivity;
    if (fundId) {
      events = events.filter((event) => event.fund_id === fundId);
    }
    return events.slice(0, maxItems);
  }, [tradingActivity, fundId, maxItems]);

  const getEventIcon = (eventType: TradingActivityEvent["event_type"]) => {
    switch (eventType) {
      case "entry":
      case "scale_in":
        return <ArrowUpCircle className="h-3.5 w-3.5 text-green-600" />;
      case "exit":
      case "scale_out":
        return <ArrowDownCircle className="h-3.5 w-3.5 text-red-600" />;
      case "warning":
        return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />;
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
      default:
        return <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />;
    }
  };

  const getEventBadgeVariant = (
    eventType: TradingActivityEvent["event_type"]
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (eventType) {
      case "entry":
        return "default";
      case "exit":
        return "destructive";
      case "warning":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatQuantity = (qty: number) => qty.toFixed(2);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Trading Activity</CardTitle>
            <CardDescription className="text-xs">
              {isConnected ? "Live updates" : "Disconnected"}{" "}
              {fundId ? "• This fund only" : "• All funds"}
            </CardDescription>
          </div>
          {isConnected && (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Live
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[500px] w-full overflow-y-auto">
          {filteredActivity.length === 0 ? (
            <div className="flex h-[500px] items-center justify-center text-xs text-muted-foreground">
              No trading activity yet. Start trading to see live updates.
            </div>
          ) : (
            <div className="space-y-1 pr-2">
              {filteredActivity.map((event, index) => {
                const isBuyEvent =
                  (event as any).side === "buy" ||
                  event.event_type === "entry" ||
                  event.event_type === "scale_in";
                const isSellEvent =
                  (event as any).side === "sell" ||
                  event.event_type === "exit" ||
                  event.event_type === "scale_out";
                const isErrorWarning =
                  event.event_type === "error" ||
                  event.event_type === "warning";

                return (
                  <div
                    key={`${event.timestamp}-${index}`}
                    className={`flex items-center gap-3 rounded border p-2.5 hover:bg-accent/30 transition-colors text-sm ${
                      isBuyEvent
                        ? "border-l-2 border-l-green-500 bg-green-50/30 dark:bg-green-950/20"
                        : isSellEvent
                        ? "border-l-2 border-l-red-500 bg-red-50/30 dark:bg-red-950/20"
                        : isErrorWarning
                        ? "border-l-2 border-l-yellow-500 bg-yellow-50/30 dark:bg-yellow-950/20"
                        : "bg-card"
                    }`}
                  >
                    {/* Icon & Badge Column */}
                    <div className="flex items-center gap-2 shrink-0 w-36">
                      {getEventIcon(event.event_type)}
                      <Badge
                        variant={getEventBadgeVariant(event.event_type)}
                        className="text-[11px] px-2 py-0.5 h-5 whitespace-nowrap"
                      >
                        {event.event_type.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>

                    {/* Symbol & Side Column */}
                    <div className="flex items-center gap-2 shrink-0 w-32">
                      {event.symbol && (
                        <span className="font-bold text-base">
                          {event.symbol}
                        </span>
                      )}
                      {(event as any).side && (
                        <Badge
                          variant={
                            (event as any).side === "buy"
                              ? "default"
                              : "secondary"
                          }
                          className={`text-[11px] px-2 py-0.5 h-5 ${
                            (event as any).side === "buy"
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : "bg-red-600 hover:bg-red-700 text-white"
                          }`}
                        >
                          {(event as any).side.toUpperCase()}
                        </Badge>
                      )}
                      {(event as any).order_type && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0.5 h-5"
                        >
                          {(event as any).order_type.toUpperCase()}
                        </Badge>
                      )}
                    </div>

                    {/* Trade Details - Horizontal Layout */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {event.quantity && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Hash className="h-3.5 w-3.5 text-blue-500" />
                          <span className="font-semibold text-blue-700 dark:text-blue-400">
                            {formatQuantity(event.quantity)}
                          </span>
                        </div>
                      )}

                      {event.price && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            @
                          </span>
                          <span className="font-semibold text-purple-700 dark:text-purple-400">
                            {formatPrice(event.price)}
                          </span>
                        </div>
                      )}

                      {(event as any).limit_price && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            Limit:
                          </span>
                          <span className="font-semibold text-orange-700 dark:text-orange-400">
                            {formatPrice((event as any).limit_price)}
                          </span>
                        </div>
                      )}

                      {(event as any).total_value && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            =
                          </span>
                          <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                            ${(event as any).total_value.toFixed(2)}
                          </span>
                        </div>
                      )}

                      {event.position_size && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            Size:
                          </span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            ${event.position_size.toFixed(0)}
                          </span>
                        </div>
                      )}

                      {event.pnl !== undefined && (
                        <div
                          className={`flex items-center gap-1.5 font-bold shrink-0 ${
                            event.pnl >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {event.pnl >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {event.pnl >= 0 ? "+" : ""}${event.pnl.toFixed(2)}
                          </span>
                          {event.pnl_percent !== undefined && (
                            <span className="text-xs font-normal">
                              ({event.pnl >= 0 ? "+" : ""}
                              {event.pnl_percent.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Message inline for errors/warnings */}
                      {event.message && isErrorWarning && (
                        <div className="text-xs text-foreground/90 truncate flex-1">
                          {event.message}
                        </div>
                      )}
                    </div>

                    {/* Metadata Column */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs text-muted-foreground min-w-[160px]">
                      {/* Time */}
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-[10px]">
                          ({formatTimeAgo(event.timestamp)})
                        </span>
                      </div>

                      {/* IDs */}
                      <div className="flex gap-2 font-mono text-[10px]">
                        {(event as any).order_id && (
                          <span className="text-blue-600 dark:text-blue-400">
                            O:{(event as any).order_id.slice(0, 6)}
                          </span>
                        )}
                        {(event as any).alpaca_order_id && (
                          <span className="text-purple-600 dark:text-purple-400">
                            A:{(event as any).alpaca_order_id.slice(0, 6)}
                          </span>
                        )}
                        {(event as any).transaction_id && (
                          <span className="text-green-600 dark:text-green-400">
                            T:{(event as any).transaction_id.slice(0, 6)}
                          </span>
                        )}
                      </div>

                      {/* Status transition */}
                      {(event as any).old_status &&
                        (event as any).new_status && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-yellow-600 dark:text-yellow-400">
                              {(event as any).old_status}
                            </span>
                            <span>→</span>
                            <span className="text-green-600 dark:text-green-400">
                              {(event as any).new_status}
                            </span>
                          </div>
                        )}

                      {/* Reason */}
                      {event.reason && (
                        <span className="italic text-[10px] truncate max-w-[160px]">
                          {event.reason}
                        </span>
                      )}
                    </div>

                    {/* Expandable Details */}
                    {(event as any).details && (
                      <details className="shrink-0">
                        <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                          ⋯
                        </summary>
                        <div className="absolute right-4 mt-1 p-2 bg-popover border rounded-lg shadow-lg z-10 max-w-md">
                          <pre className="text-[10px] overflow-auto max-h-48">
                            {JSON.stringify((event as any).details, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
