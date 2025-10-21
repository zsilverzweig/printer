import * as React from "react";

import { useMarketStream } from "@/features/finance/market/hooks/use-market-stream";

export function useStockRealtime(symbol: string) {
  const [lastEvent, setLastEvent] = React.useState<unknown | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onMessage = React.useCallback(
    (msg: unknown) => {
      try {
        if (Array.isArray(msg)) {
          const match = msg.find((m: any) => {
            const s = (m && (m.sym || m.symbol || m.S)) as string | undefined;
            return typeof s === "string" && s.toUpperCase() === symbol;
          });
          if (match) setLastEvent(match);
        } else if (msg && typeof msg === "object") {
          const s = (msg as any).sym || (msg as any).symbol || (msg as any).S;
          if (typeof s === "string") {
            if (s.toUpperCase() === symbol) setLastEvent(msg);
          } else {
            setLastEvent(msg);
          }
        } else if (typeof msg === "string") {
          try {
            const parsed = JSON.parse(msg);
            if (Array.isArray(parsed)) {
              const match = parsed.find((m: any) => {
                const s = (m && (m.sym || m.symbol || m.S)) as
                  | string
                  | undefined;
                return typeof s === "string" && s.toUpperCase() === symbol;
              });
              if (match) setLastEvent(match);
            } else {
              setLastEvent(parsed);
            }
          } catch {
            setLastEvent(msg);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "WS message error");
      }
    },
    [symbol]
  );

  const {
    isConnected,
    isConnecting,
    error: hookError,
  } = useMarketStream({
    endpoint: process.env.NEXT_PUBLIC_MARKET_WS_URL as string,
    subs: `AM.${symbol}`,
    onMessage,
  });

  React.useEffect(() => {
    setError(hookError || null);
  }, [hookError]);

  return { isConnected, isConnecting, lastEvent, error } as const;
}
