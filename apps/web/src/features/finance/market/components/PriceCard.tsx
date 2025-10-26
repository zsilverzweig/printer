"use client";

import { CandlestickChart } from "@/lib/components/ui/candlestick-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { SimpleLineChart } from "@/lib/components/ui/simple-line-chart";
import type { AggregateBar } from "@/lib/types/market";

export interface PriceCardProps {
  aggs: AggregateBar[] | null;
  chartPoints: Array<{ x: number; y: number }>;
  loading: boolean;
}

export function PriceCard({ aggs, chartPoints, loading }: PriceCardProps) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base font-medium text-muted-foreground">
          Price
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-2">
        {loading ? (
          <div className="flex h-[90vh] items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : aggs && aggs.length > 0 ? (
          <div className="h-[90vh]">
            <CandlestickChart data={aggs} height="100%" />
          </div>
        ) : (
          <SimpleLineChart data={chartPoints} height={280} />
        )}
      </CardContent>
    </Card>
  );
}
