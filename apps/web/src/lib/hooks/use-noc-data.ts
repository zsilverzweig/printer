import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import type { StockIndicators } from "@printer/shared";

export function useNocData() {
  const { nocData, isConnected, connectionStatus, error } = useWebSocketContext();
  
  return { 
    data: nocData, 
    isConnected: isConnected && connectionStatus.noc, 
    error 
  };
}

