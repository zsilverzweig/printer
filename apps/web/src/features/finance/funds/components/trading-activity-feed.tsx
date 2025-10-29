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
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";

// Simple time ago formatter
function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
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
        return <ArrowUpCircle className="h-4 w-4 text-green-500" />;
      case "exit":
      case "scale_out":
        return <ArrowDownCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getEventBadgeVariant = (
    eventType: TradingActivityEvent["event_type"]
  ) => {
    switch (eventType) {
      case "entry":
        return "default";
      case "exit":
        return "destructive";
      case "scale_in":
        return "secondary";
      case "scale_out":
        return "outline";
      case "warning":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "default";
    }
  };

  const getEventLabel = (eventType: TradingActivityEvent["event_type"]) => {
    switch (eventType) {
      case "entry":
        return "Entry";
      case "exit":
        return "Exit";
      case "scale_in":
        return "Scale In";
      case "scale_out":
        return "Scale Out";
      case "warning":
        return "Warning";
      case "error":
        return "Error";
      default:
        return eventType;
    }
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatQuantity = (qty: number) => qty.toFixed(2);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Trading Activity</CardTitle>
            <CardDescription>
              {isConnected ? "Live updates" : "Disconnected"}{" "}
              {fundId ? "for this fund" : "across all funds"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full overflow-y-auto">
          {filteredActivity.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
              No trading activity yet. Start trading to see live updates here.
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {filteredActivity.map((event, index) => (
                <div
                  key={`${event.timestamp}-${index}`}
                  className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="mt-0.5">{getEventIcon(event.event_type)}</div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={getEventBadgeVariant(event.event_type)}>
                        {getEventLabel(event.event_type)}
                      </Badge>
                      {event.symbol && (
                        <span className="font-semibold">{event.symbol}</span>
                      )}
                      {!fundId && (
                        <span className="text-xs text-muted-foreground">
                          • {event.fund_name}
                        </span>
                      )}
                    </div>

                    {/* Show message for warnings/errors */}
                    {(event.event_type === "warning" ||
                      event.event_type === "error") &&
                      event.message && (
                        <div className="text-sm font-medium">
                          {event.message}
                        </div>
                      )}

                    {/* Show trade details for normal events */}
                    {event.quantity && event.price && (
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          {formatQuantity(event.quantity)} shares @{" "}
                          {formatPrice(event.price)}
                        </span>

                        {event.position_size && (
                          <span className="text-xs">
                            Size: ${event.position_size.toFixed(0)}
                          </span>
                        )}

                        {event.pnl !== undefined && (
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              event.pnl >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {event.pnl >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {event.pnl >= 0 ? "+" : ""}${event.pnl.toFixed(2)}
                            {event.pnl_percent !== undefined &&
                              ` (${event.pnl_percent.toFixed(2)}%)`}
                          </span>
                        )}

                        {event.percent && (
                          <span className="text-xs">
                            {event.percent}% scaled
                          </span>
                        )}

                        {event.multiplier && (
                          <span className="text-xs">
                            {event.multiplier}x multiplier
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        {formatTimeAgo(event.timestamp)}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        {event.reason}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
