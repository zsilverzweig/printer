"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

export interface RealtimePanelProps {
  isConnected: boolean;
  isConnecting: boolean;
  lastEvent: unknown | null;
  error: string | null;
}

export function RealtimePanel({
  isConnected,
  isConnecting,
  lastEvent,
  error,
}: RealtimePanelProps) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Realtime (WS)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm grid gap-2">
          <div>
            <span className="text-muted-foreground">Status: </span>
            <span>
              {isConnecting
                ? "Connecting"
                : isConnected
                ? "Connected"
                : "Disconnected"}
            </span>
          </div>
          {error && <div className="text-destructive">{error}</div>}
          <div className="grid gap-1">
            <div className="text-muted-foreground">Last event</div>
            <pre className="max-h-64 overflow-auto rounded border bg-muted p-2 text-xs">
              {lastEvent ? JSON.stringify(lastEvent as any, null, 2) : "—"}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
