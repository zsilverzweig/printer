import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import { useEffect } from "react";

export function useScreenerData() {
  const { screenerData, isConnected, connectionStatus, error } =
    useWebSocketContext();

  useEffect(() => {
    console.log("[useScreenerData] Hook update:", {
      screenerDataLength: screenerData?.length ?? 0,
      screenerData: screenerData,
      isConnected,
      connectionStatus,
      error,
      screenerConnected: isConnected && connectionStatus.screener,
    });
  }, [screenerData, isConnected, connectionStatus, error]);

  return {
    data: screenerData,
    isConnected: isConnected && connectionStatus.screener,
    error,
  };
}
