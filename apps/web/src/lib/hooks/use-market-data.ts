import { useEffect } from "react";
import { useWebSocketContext } from "@/lib/providers/websocket-provider";

export function useMarketData(symbol: string) {
  const { 
    marketData, 
    subscribeToSymbol, 
    unsubscribeFromSymbol, 
    isConnected, 
    connectionStatus 
  } = useWebSocketContext();
  
  useEffect(() => {
    if (!symbol) return;
    
    subscribeToSymbol(symbol);
    return () => unsubscribeFromSymbol(symbol);
  }, [symbol, subscribeToSymbol, unsubscribeFromSymbol]);
  
  return {
    data: marketData.get(symbol),
    isConnected: isConnected && connectionStatus.market,
  };
}

