/**
 * ActivityFeed Component
 *
 * Displays strategy engine events for a fund with filtering and refresh.
 */

"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
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
import { ScrollArea } from "@/lib/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

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

interface ActivityFeedProps {
  fundId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  position_sync: "Position Sync",
  fill_tracking: "Fill Tracking",
  order_decision: "Order Decision",
  validation: "Validation",
  error: "Error",
  all: "All Categories",
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

export function ActivityFeed({ fundId }: ActivityFeedProps) {
  const [events, setEvents] = useState<StrategyEngineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        fund_id: fundId,
        limit: "50",
      });

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

  useEffect(() => {
    if (fundId) {
      fetchEvents();
    }
  }, [fundId, category, severity]);

  const SeverityIcon = ({
    severity,
  }: {
    severity: StrategyEngineEvent["severity"];
  }) => {
    const Icon = SEVERITY_ICONS[severity];
    return <Icon className={`h-4 w-4 ${SEVERITY_COLORS[severity]}`} />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <CardDescription>
              Strategy engine events and trading activity
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS)
                .filter(([key]) => key !== "all")
                .map(([value, label]) => (
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
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-[500px] w-full">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No events found. Strategy events will appear here as the fund
              trades.
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    event.severity === "error"
                      ? "border-red-200 bg-red-50/50"
                      : event.severity === "warning"
                      ? "border-yellow-200 bg-yellow-50/50"
                      : "bg-card"
                  }`}
                >
                  <SeverityIcon severity={event.severity} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {CATEGORY_LABELS[event.event_category] ||
                          event.event_category}
                      </Badge>
                      {event.symbol && (
                        <span className="font-semibold text-sm">
                          {event.symbol}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{event.message}</p>
                    {event.event_data &&
                      Object.keys(event.event_data).length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">
                            View details
                          </summary>
                          <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto">
                            {JSON.stringify(event.event_data, null, 2)}
                          </pre>
                        </details>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
