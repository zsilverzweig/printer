import * as React from "react";
import { useMarketData } from "@/lib/hooks/use-market-data";

export function useStockRealtime(symbol: string) {
  const [lastEvent, setLastEvent] = React.useState<unknown | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { data, isConnected } = useMarketData(symbol);

  React.useEffect(() => {
    if (data) {
      setLastEvent(data);
    }
  }, [data]);

  return { isConnected, isConnecting: false, lastEvent, error } as const;
}
