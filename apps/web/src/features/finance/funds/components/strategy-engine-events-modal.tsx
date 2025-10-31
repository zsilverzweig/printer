/**
 * Strategy Engine Events Modal
 *
 * Displays detailed strategy engine events for debugging position tracking,
 * order fills, and strategy decisions.
 */

import { Activity, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { ScrollArea } from "@/lib/components/ui/scroll-area";

interface StrategyEngineEvent {
  id: number;
  type: "strategy_engine";
  timestamp: string;
  fund_id: string;
  event_category: string;
  symbol: string | null;
  severity: "info" | "warning" | "error";
  message: string;
  event_data: Record<string, any> | null;
}

interface StrategyEngineEventsModalProps {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSymbol?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  position_sync: "Position Sync",
  fill_tracking: "Fill Tracking",
  order_decision: "Order Decision",
  validation: "Validation",
  error: "Error",
};

const SEVERITY_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const SEVERITY_COLORS = {
  info: "text-blue-500",
  warning: "text-yellow-500",
  error: "text-red-500",
};

export function StrategyEngineEventsModal({
  fundId,
  open,
  onOpenChange,
  initialSymbol,
}: StrategyEngineEventsModalProps) {
  const [events, setEvents] = useState<StrategyEngineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState<string>(initialSymbol || "all");
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");

  useEffect(() => {
    if (open && fundId) {
      fetchEvents();
    }
  }, [open, fundId, symbol, category, severity]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        fund_id: fundId,
        limit: "100",
      });
      
      if (symbol && symbol !== "all") params.append("symbol", symbol);
      if (category && category !== "all") params.append("category", category);
      if (severity && severity !== "all") params.append("severity", severity);

      const response = await fetch(
        `http://localhost:8000/api/events/strategy-engine?${params}`
      );
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error("Failed to fetch strategy engine events:", error);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique symbols from events
  const symbols = Array.from(
    new Set(events.map((e) => e.symbol).filter(Boolean))
  ).sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Strategy Engine Events
          </DialogTitle>
          <DialogDescription>
            Detailed audit trail of position tracking, fills, and decisions
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Symbols</SelectItem>
              {symbols.map((sym) => (
                <SelectItem key={sym} value={sym!}>
                  {sym}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSymbol("all");
              setCategory("all");
              setSeverity("all");
            }}
          >
            Clear Filters
          </Button>
        </div>

        {/* Events List */}
        <ScrollArea className="h-[500px] pr-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No events found
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event) => {
                const SeverityIcon = SEVERITY_ICONS[event.severity];
                return (
                  <div
                    key={event.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <SeverityIcon
                          className={`h-4 w-4 ${SEVERITY_COLORS[event.severity]}`}
                        />
                        <Badge variant="outline">
                          {CATEGORY_LABELS[event.event_category] ||
                            event.event_category}
                        </Badge>
                        {event.symbol && (
                          <Badge variant="secondary">{event.symbol}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    {/* Message */}
                    <p className="text-sm">{event.message}</p>

                    {/* Event Data */}
                    {event.event_data && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View Details
                        </summary>
                        <div className="mt-2 bg-muted rounded p-2 font-mono space-y-1">
                          {Object.entries(event.event_data).map(
                            ([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <span className="text-muted-foreground">
                                  {key}:
                                </span>
                                <span>
                                  {typeof value === "number"
                                    ? value.toFixed(8)
                                    : JSON.stringify(value)}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

