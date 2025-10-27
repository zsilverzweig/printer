"use client";

import React, { useState } from "react";
import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/lib/components/ui/card";
import { Button } from "@/lib/components/ui/button";
import { Badge } from "@/lib/components/ui/badge";
import { 
  Wifi, 
  WifiOff, 
  ChevronDown, 
  ChevronUp, 
  Clock,
  Activity
} from "lucide-react";

export function WebSocketStatus() {
  const { 
    isConnected, 
    connectionStatus, 
    lastUpdate, 
    error, 
    subscribedSymbols 
  } = useWebSocketContext();
  
  const [isExpanded, setIsExpanded] = useState(false);
  
  const formatLastUpdate = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return "Just now";
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };
  
  const getStatusColor = (status: boolean) => {
    return status ? "bg-green-500" : "bg-red-500";
  };
  
  const getStatusIcon = (status: boolean) => {
    return status ? Wifi : WifiOff;
  };
  
  const allHealthy = connectionStatus.noc && connectionStatus.screener && connectionStatus.market;
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className={`w-80 transition-all duration-200 ${
        isExpanded ? "shadow-lg" : "shadow-md"
      }`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              WebSocket Status
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          {/* Compact view - always visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`} />
              <span className="text-xs text-muted-foreground">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            
            <div className="flex items-center gap-1">
              <div className={`h-1.5 w-1.5 rounded-full ${getStatusColor(connectionStatus.noc)}`} />
              <div className={`h-1.5 w-1.5 rounded-full ${getStatusColor(connectionStatus.screener)}`} />
              <div className={`h-1.5 w-1.5 rounded-full ${getStatusColor(connectionStatus.market)}`} />
            </div>
          </div>
          
          {/* Expanded view */}
          {isExpanded && (
            <div className="mt-3 space-y-2">
              {/* Service status */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">NOC Service</span>
                  <div className="flex items-center gap-1">
                    {React.createElement(getStatusIcon(connectionStatus.noc), { 
                      className: "h-3 w-3" 
                    })}
                    <span className={connectionStatus.noc ? "text-green-600" : "text-red-600"}>
                      {connectionStatus.noc ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Screener Service</span>
                  <div className="flex items-center gap-1">
                    {React.createElement(getStatusIcon(connectionStatus.screener), { 
                      className: "h-3 w-3" 
                    })}
                    <span className={connectionStatus.screener ? "text-green-600" : "text-red-600"}>
                      {connectionStatus.screener ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Market Data</span>
                  <div className="flex items-center gap-1">
                    {React.createElement(getStatusIcon(connectionStatus.market), { 
                      className: "h-3 w-3" 
                    })}
                    <span className={connectionStatus.market ? "text-green-600" : "text-red-600"}>
                      {connectionStatus.market ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Last update */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last update: {formatLastUpdate(lastUpdate)}</span>
              </div>
              
              {/* Market subscriptions */}
              {subscribedSymbols.size > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Market Subscriptions ({subscribedSymbols.size})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(subscribedSymbols).map(symbol => (
                      <Badge key={symbol} variant="secondary" className="text-xs">
                        {symbol}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Error message */}
              {error && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
                  {error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
