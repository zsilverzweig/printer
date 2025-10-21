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
import { useWebSocket } from "@/lib/hooks/use-websocket";
import { useEffect, useState } from "react";

/**
 * Signal status for each indicator
 */
type SignalStatus = "green" | "yellow" | "red";

/**
 * Stock data with all indicators
 */
interface StockIndicators {
  ticker: string;
  price: number;
  priceSignal: SignalStatus;
  changePercent: number;
  changeSignal: SignalStatus;
  relativeVolume: number;
  rvSignal: SignalStatus;
  newsSentiment: string;
  newsSignal: SignalStatus;
  float: string;
  floatSignal: SignalStatus;
  bullFlag: boolean;
  flagSignal: SignalStatus;
}

/**
 * Get signal color
 */
const getSignalColor = (signal: SignalStatus): string => {
  switch (signal) {
    case "green":
      return "bg-green-500";
    case "yellow":
      return "bg-yellow-500";
    case "red":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
};

/**
 * Signal indicator component
 */
const SignalIndicator = ({ signal }: { signal: SignalStatus }) => (
  <div className={`w-3 h-3 rounded-sm ${getSignalColor(signal)}`} />
);

/**
 * Combined signals display for a stock
 */
const SignalBar = ({ stock }: { stock: StockIndicators }) => {
  const signals: SignalStatus[] = [
    stock.priceSignal,
    stock.changeSignal,
    stock.rvSignal,
    stock.newsSignal,
    stock.floatSignal,
    stock.flagSignal,
  ];

  return (
    <div className="flex gap-1">
      {signals.map((signal, idx) => (
        <SignalIndicator key={idx} signal={signal} />
      ))}
    </div>
  );
};

/**
 * Dummy data for testing
 */
const DUMMY_STOCKS: StockIndicators[] = [
  {
    ticker: "AAPL",
    price: 178.25,
    priceSignal: "green",
    changePercent: 2.34,
    changeSignal: "green",
    relativeVolume: 1.45,
    rvSignal: "green",
    newsSentiment: "Positive",
    newsSignal: "green",
    float: "15.3B",
    floatSignal: "yellow",
    bullFlag: true,
    flagSignal: "green",
  },
  {
    ticker: "TSLA",
    price: 242.84,
    priceSignal: "green",
    changePercent: -1.23,
    changeSignal: "red",
    relativeVolume: 2.15,
    rvSignal: "green",
    newsSentiment: "Mixed",
    newsSignal: "yellow",
    float: "3.2B",
    floatSignal: "green",
    bullFlag: false,
    flagSignal: "red",
  },
  {
    ticker: "NVDA",
    price: 875.32,
    priceSignal: "green",
    changePercent: 3.87,
    changeSignal: "green",
    relativeVolume: 1.92,
    rvSignal: "green",
    newsSentiment: "Positive",
    newsSignal: "green",
    float: "2.5B",
    floatSignal: "green",
    bullFlag: true,
    flagSignal: "green",
  },
  {
    ticker: "META",
    price: 485.12,
    priceSignal: "yellow",
    changePercent: 0.45,
    changeSignal: "yellow",
    relativeVolume: 0.87,
    rvSignal: "yellow",
    newsSentiment: "Neutral",
    newsSignal: "yellow",
    float: "2.6B",
    floatSignal: "green",
    bullFlag: false,
    flagSignal: "yellow",
  },
  {
    ticker: "AMZN",
    price: 145.67,
    priceSignal: "red",
    changePercent: -2.15,
    changeSignal: "red",
    relativeVolume: 0.65,
    rvSignal: "red",
    newsSentiment: "Negative",
    newsSignal: "red",
    float: "10.4B",
    floatSignal: "yellow",
    bullFlag: false,
    flagSignal: "red",
  },
  {
    ticker: "MSFT",
    price: 412.33,
    priceSignal: "green",
    changePercent: 1.56,
    changeSignal: "green",
    relativeVolume: 1.23,
    rvSignal: "green",
    newsSentiment: "Positive",
    newsSignal: "green",
    float: "7.4B",
    floatSignal: "yellow",
    bullFlag: true,
    flagSignal: "green",
  },
  {
    ticker: "GOOGL",
    price: 162.45,
    priceSignal: "green",
    changePercent: 0.89,
    changeSignal: "yellow",
    relativeVolume: 1.05,
    rvSignal: "green",
    newsSentiment: "Positive",
    newsSignal: "green",
    float: "12.5B",
    floatSignal: "yellow",
    bullFlag: false,
    flagSignal: "yellow",
  },
];

/**
 * Signal legend component
 */
const SignalLegend = () => (
  <div className="flex flex-wrap gap-6 text-sm text-muted-foreground mb-4">
    <div className="flex items-center gap-2">
      <span className="font-medium">Signal Order:</span>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm border border-gray-300" />
        <span className="text-xs">Price</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm border border-gray-300" />
        <span className="text-xs">Change</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm border border-gray-300" />
        <span className="text-xs">RV</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm border border-gray-300" />
        <span className="text-xs">News</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm border border-gray-300" />
        <span className="text-xs">Float</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm border border-gray-300" />
        <span className="text-xs">Flag</span>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className="font-medium">Status:</span>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm bg-green-500" />
        <span>Good</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm bg-yellow-500" />
        <span>Neutral</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm bg-red-500" />
        <span>Bad</span>
      </div>
    </div>
  </div>
);

/**
 * NOC Table Component
 * Displays stocks with all their indicators in a table format
 */
export function NocTable() {
  const [stocks, setStocks] = useState<StockIndicators[]>(DUMMY_STOCKS);

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
  useEffect(() => {
    if (lastMessage && Array.isArray(lastMessage)) {
      setStocks(lastMessage);
    }
  }, [lastMessage]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Network Operations Center
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
            title={isConnected ? "Connected" : "Disconnected"}
          />
        </CardTitle>
        <CardDescription>
          Real-time stock monitoring with multi-factor signal analysis. All
          green signals = ready to trade.
          {error && (
            <span className="block text-red-500 text-xs mt-1">
              Error: {error}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignalLegend />
        <Table>
          <TableHeader>
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
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-medium">{stock.ticker}</TableCell>
                <TableCell>
                  <SignalBar stock={stock} />
                </TableCell>
                <TableCell className="text-right">
                  ${stock.price.toFixed(2)}
                </TableCell>
                <TableCell
                  className={`text-right ${
                    stock.changePercent >= 0 ? "text-green-600" : "text-red-600"
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
      </CardContent>
    </Card>
  );
}
