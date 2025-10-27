import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import type { ScreenedStockPreview } from "@/lib/types/market";

export function useScreenerData() {
  const { screenerData, isConnected, connectionStatus, error } = useWebSocketContext();
  
  return { 
    data: screenerData, 
    isConnected: isConnected && connectionStatus.screener, 
    error 
  };
}

