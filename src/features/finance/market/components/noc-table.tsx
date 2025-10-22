"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/components/ui/tooltip";
import { useWebSocket } from "@/lib/hooks/use-websocket";
import { useEffect, useState } from "react";
import { NocRealtimeChart } from "./noc-realtime-chart";

/**
 * Stock data with all indicators (raw values, colors calculated on client)
 */
interface StockIndicators {
  ticker: string;
  price: number;
  changePercent: number;
  relativeVolume: number;
  newsSentiment: string;
  float: string;
  bullFlag: boolean;
}

/**
 * Calculate price signal color based on value
 * Green: 6-8, Yellow: 4-14 (excluding 6-8), Red: 2-20 (excluding 4-14)
 */
const getPriceSignalColor = (price: number): string => {
  if (price >= 6 && price <= 8) return "bg-green-500";
  if (price >= 4 && price <= 14) return "bg-yellow-500";
  if (price >= 2 && price <= 20) return "bg-red-500";
  return "bg-gray-500";
};

/**
 * Calculate relative volume signal color
 * Red: 0-2x, Yellow: 2-5x, Green: 5x+
 */
const getRelativeVolumeSignalColor = (rv: number): string => {
  if (rv >= 5) return "bg-green-500";
  if (rv >= 2) return "bg-yellow-500";
  return "bg-red-500";
};

/**
 * Calculate change percent signal color
 * Green: 10%+, Yellow: 5-10%, Red: <5% (should be filtered out)
 */
const getChangePercentSignalColor = (changePercent: number): string => {
  const absChange = Math.abs(changePercent);
  if (absChange >= 10) return "bg-green-500";
  if (absChange >= 5) return "bg-yellow-500";
  return "bg-red-500";
};

/**
 * Signal indicator component with tooltip
 */
const SignalIndicator = ({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className={`w-3 h-3 rounded-sm ${color} cursor-pointer`} />
    </TooltipTrigger>
    <TooltipContent>
      <div className="text-xs">
        <div className="font-semibold">{label}</div>
        <div>{value}</div>
      </div>
    </TooltipContent>
  </Tooltip>
);

/**
 * Combined signals display for a stock
 */
const SignalBar = ({ stock }: { stock: StockIndicators }) => {
  const signals = [
    {
      color: getPriceSignalColor(stock.price),
      label: "Price",
      value: `$${stock.price.toFixed(2)}`,
    },
    {
      color: getChangePercentSignalColor(stock.changePercent),
      label: "Change",
      value: `${
        stock.changePercent >= 0 ? "+" : ""
      }${stock.changePercent.toFixed(2)}%`,
    },
    {
      color: getRelativeVolumeSignalColor(stock.relativeVolume),
      label: "Relative Volume",
      value: `${stock.relativeVolume.toFixed(2)}x`,
    },
    {
      color: "bg-gray-500", // Placeholder
      label: "News",
      value: stock.newsSentiment,
    },
    {
      color: "bg-gray-500", // Placeholder
      label: "Float",
      value: stock.float,
    },
    {
      color: "bg-gray-500", // Placeholder
      label: "Bull Flag",
      value: stock.bullFlag ? "Yes" : "No",
    },
  ];

  return (
    <div className="flex gap-1">
      {signals.map((signal, idx) => (
        <SignalIndicator
          key={idx}
          color={signal.color}
          label={signal.label}
          value={signal.value}
        />
      ))}
    </div>
  );
};

/**
 * Dummy data for testing
 * Only includes stocks with 5%+ change (filter requirement)
 */
const DUMMY_STOCKS: StockIndicators[] = [
  {
    ticker: "AAPL",
    price: 7.25,
    changePercent: 12.34,
    relativeVolume: 6.45,
    newsSentiment: "Positive",
    float: "15.3B",
    bullFlag: true,
  },
  {
    ticker: "TSLA",
    price: 12.84,
    changePercent: -8.23,
    relativeVolume: 2.15,
    newsSentiment: "Mixed",
    float: "3.2B",
    bullFlag: false,
  },
  {
    ticker: "NVDA",
    price: 5.32,
    changePercent: 15.87,
    relativeVolume: 1.92,
    newsSentiment: "Positive",
    float: "2.5B",
    bullFlag: true,
  },
  {
    ticker: "META",
    price: 9.12,
    changePercent: 6.45,
    relativeVolume: 3.87,
    newsSentiment: "Neutral",
    float: "2.6B",
    bullFlag: false,
  },
  {
    ticker: "AMZN",
    price: 15.67,
    changePercent: -11.15,
    relativeVolume: 0.65,
    newsSentiment: "Negative",
    float: "10.4B",
    bullFlag: false,
  },
  {
    ticker: "MSFT",
    price: 6.33,
    changePercent: 9.56,
    relativeVolume: 5.23,
    newsSentiment: "Positive",
    float: "7.4B",
    bullFlag: true,
  },
  {
    ticker: "GOOGL",
    price: 3.45,
    changePercent: 5.89,
    relativeVolume: 1.05,
    newsSentiment: "Positive",
    float: "12.5B",
    bullFlag: false,
  },
];

type TimeframeFilter = "1m" | "5m" | "1h" | "close";

const TIMEFRAME_LABELS: Record<TimeframeFilter, string> = {
  "1m": "Last 1m",
  "5m": "Last 5m",
  "1h": "Last Hour",
  close: "Since Close",
};

/**
 * TCC Table Component
 * Displays stocks with all their indicators in a table format
 * Server filters: 5%+ change, 50k+ volume, up to 50 stocks
 */
export function NocTable() {
  const [stocks, setStocks] = useState<StockIndicators[]>(DUMMY_STOCKS);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<TimeframeFilter>("close");

  // WebSocket URL for NOC real-time data
  // Adjust the URL based on your server configuration
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
  const nocWsUrl = `${wsUrl}/noc/ws`;

  const { lastMessage, isConnected, error } = useWebSocket<StockIndicators[]>(
    nocWsUrl,
    {
      autoReconnect: true,
      reconnectIntervalMs: 3000,
      debug: true,
    }
  );

  // Update stocks when new WebSocket data arrives
  // Server already filters for 5%+ change and 50k+ volume
  useEffect(() => {
    if (lastMessage && Array.isArray(lastMessage)) {
      setStocks(lastMessage);
    }
  }, [lastMessage]);

  const handleStockClick = (ticker: string) => {
    setSelectedStock(ticker);
  };

  const handleTimeframeChange = async (timeframe: TimeframeFilter) => {
    setSelectedTimeframe(timeframe);

    // Send REST API call to update server filter settings
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      const response = await fetch(`${baseUrl}/noc/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeframe: timeframe,
        }),
      });

      if (!response.ok) {
        console.error("Failed to update NOC config:", await response.text());
      } else {
        const config = await response.json();
        console.log("NOC config updated:", config);
      }
    } catch (error) {
      console.error("Error updating NOC config:", error);
    }
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
        {/* Stock List */}
        <div className={selectedStock ? "lg:col-span-5" : "lg:col-span-12"}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Market Screener
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isConnected ? "bg-green-500" : "bg-red-500"
                      }`}
                      title={isConnected ? "Connected" : "Disconnected"}
                    />
                  </CardTitle>
                  <CardDescription>
                    Real-time stock monitoring with multi-factor signal
                    analysis. Click a stock to view chart. Hover over signals
                    for details.
                    {error && (
                      <span className="block text-red-500 text-xs mt-1">
                        Error: {error}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
              {/* Timeframe filter buttons */}
              <div className="flex flex-wrap gap-2 mt-4">
                {(Object.keys(TIMEFRAME_LABELS) as TimeframeFilter[]).map(
                  (timeframe) => (
                    <button
                      key={timeframe}
                      onClick={() => handleTimeframeChange(timeframe)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        selectedTimeframe === timeframe
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {TIMEFRAME_LABELS[timeframe]}
                    </button>
                  )
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[calc(100vh-280px)] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Signals</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">% Change</TableHead>
                      <TableHead className="text-right">RV</TableHead>
                      <TableHead>News</TableHead>
                      <TableHead>Float</TableHead>
                      <TableHead>Bull Flag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stocks.map((stock) => (
                      <TableRow
                        key={stock.ticker}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          selectedStock === stock.ticker ? "bg-muted" : ""
                        }`}
                        onClick={() => handleStockClick(stock.ticker)}
                      >
                        <TableCell className="font-medium">
                          {stock.ticker}
                        </TableCell>
                        <TableCell>
                          <SignalBar stock={stock} />
                        </TableCell>
                        <TableCell className="text-right">
                          ${stock.price.toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${
                            stock.changePercent >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {stock.changePercent >= 0 ? "+" : ""}
                          {stock.changePercent.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.relativeVolume.toFixed(2)}x
                        </TableCell>
                        <TableCell>{stock.newsSentiment}</TableCell>
                        <TableCell>{stock.float}</TableCell>
                        <TableCell>{stock.bullFlag ? "Yes" : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart Panel */}
        {selectedStock && (
          <div className="lg:col-span-7 h-[calc(100vh-120px)]">
            <NocRealtimeChart
              symbol={selectedStock}
              onClose={() => setSelectedStock(null)}
              onSymbolChange={(newSymbol) => setSelectedStock(newSymbol)}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
