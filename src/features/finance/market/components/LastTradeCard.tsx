"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import type { LastTrade } from "@/lib/types/market";

export interface LastTradeCardProps {
  lastTrade: LastTrade | null;
}

export function LastTradeCard({ lastTrade }: LastTradeCardProps) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Last trade</CardTitle>
      </CardHeader>
      <CardContent>
        {lastTrade ? (
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Price</div>
              <div className="font-medium">${lastTrade.price?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Size</div>
              <div className="font-medium">{lastTrade.size ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Exchange</div>
              <div className="font-medium">{lastTrade.exchange ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Time</div>
              <div className="font-medium">
                {lastTrade.timestamp
                  ? new Date(
                      String(lastTrade.timestamp).length > 13
                        ? Math.floor(
                            (lastTrade.timestamp as number) / 1_000_000
                          )
                        : (lastTrade.timestamp as number)
                    ).toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No trade data</div>
        )}
      </CardContent>
    </Card>
  );
}
