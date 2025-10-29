"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { CardActionButton } from "@/lib/components/ui/card-action-button";
import { Input } from "@/lib/components/ui/input";
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
import { useNocData } from "@/lib/hooks/use-noc-data";
import type { StockIndicators } from "@printer/shared";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FinancialInfoPanel } from "./financial-info-panel";
import { NewsCard } from "./news-card";
import { NocRealtimeChart } from "./noc-realtime-chart";
import { TickerFilterMenu, type FilterCriteria } from "./ticker-filter-menu";
import { TradeCard } from "./trade-card";

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
  description,
}: {
  color: string;
  label: string;
  value: string;
  description?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className={`w-3 h-3 rounded-sm ${color} cursor-pointer`} />
    </TooltipTrigger>
    <TooltipContent>
      <div className="text-xs">
        <div className="font-semibold">{label}</div>
        <div>{value}</div>
        {description && (
          <div className="mt-1 text-gray-600 dark:text-gray-400 max-w-xs">
            {description}
          </div>
        )}
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
      description:
        "Percentage change from previous close: (current_price - yesterday_close) / yesterday_close × 100",
    },
    {
      color: getRelativeVolumeSignalColor(stock.relativeVolume),
      label: "Relative Volume",
      value: `${stock.relativeVolume.toFixed(2)}x`,
      description:
        "Today's volume compared to average volume: current_volume / average_volume. Values >1.0 indicate above-average trading activity.",
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
          description={signal.description}
        />
      ))}
    </div>
  );
};

/**
 * Compact signal indicators for narrow screener
 * Strongly colored squares without characters
 */
const CompactSignalBar = ({ stock }: { stock: StockIndicators }) => {
  const signals = [
    {
      color: getPriceSignalColor(stock.price),
      label: "Price Signal",
      value: `$${stock.price.toFixed(2)}`,
      description: "Price range: Green (6-8), Yellow (4-14), Red (2-20)",
    },
    {
      color: getChangePercentSignalColor(stock.changePercent),
      label: "Change Signal",
      value: `${
        stock.changePercent >= 0 ? "+" : ""
      }${stock.changePercent.toFixed(2)}%`,
      description: "Change: Green (10%+), Yellow (5-10%), Red (<5%)",
    },
    {
      color: getRelativeVolumeSignalColor(stock.relativeVolume),
      label: "Volume Signal",
      value: `${stock.relativeVolume.toFixed(2)}x`,
      description: "Relative Volume: Green (5x+), Yellow (2-5x), Red (<2x)",
    },
  ];

  return (
    <div className="flex gap-0.5">
      {signals.map((signal, idx) => (
        <Tooltip key={idx}>
          <TooltipTrigger asChild>
            <div
              className={`w-3 h-3 rounded-sm ${signal.color} cursor-pointer`}
            />
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-xs">
              <div className="font-semibold">{signal.label}</div>
              <div>{signal.value}</div>
              <div className="mt-1 text-gray-600 dark:text-gray-400 max-w-xs">
                {signal.description}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
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
  "1m": "1m",
  "5m": "5m",
  "1h": "1h",
  close: "close",
};

interface NocTableProps {
  initialTicker?: string;
}

/**
 * TCC Table Component
 * Displays stocks with all their indicators in a table format
 * Server filters: 5%+ change, 50k+ volume, up to 50 stocks
 */
export function NocTable({ initialTicker }: NocTableProps) {
  const router = useRouter();
  const [selectedStock, setSelectedStock] = useState<string | null>(
    initialTicker || "AAPL" // Default to AAPL or URL param
  );
  const [tickerInput, setTickerInput] = useState("");
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<TimeframeFilter>("close");
  const [newsData, setNewsData] = useState<{
    news_summary?: string;
    key_events?: Array<{ name: string; summary: string }>;
  } | null>(null);
  const [financialData, setFinancialData] = useState<{
    overview?: Record<string, unknown>;
    financials?: Record<string, unknown>;
  } | null>(null);
  const chartCaptureRef = useRef<(() => Promise<string>) | null>(null);

  // Filter state
  const [filteredTickers, setFilteredTickers] = useState<Set<string> | null>(
    null
  );
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // Use new unified WebSocket hook
  const { data: stocks, isConnected, error } = useNocData();

  const handleStockClick = (ticker: string) => {
    setSelectedStock(ticker);
    // Update URL without page reload
    router.push(`/?ticker=${ticker}`, { scroll: false });
  };

  const handleTickerInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();
    if (ticker) {
      setSelectedStock(ticker);
      router.push(`/?ticker=${ticker}`, { scroll: false });
      setTickerInput("");
    }
  };

  // Clear card contents when stock changes
  useEffect(() => {
    setNewsData(null);
    setFinancialData(null);
  }, [selectedStock]);

  const handleTimeframeChange = async (timeframe: TimeframeFilter) => {
    setSelectedTimeframe(timeframe);

    // Send REST API call to update server filter settings
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      const response = await fetch(`${baseUrl}/api/noc/config`, {
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

  // Memoize callbacks to prevent infinite re-render loops
  const handleNewsLoad = useCallback(
    (data: {
      news_summary?: string;
      key_events?: Array<{ name: string; summary: string }>;
    }) => {
      setNewsData({
        news_summary: data.news_summary,
        key_events: data.key_events,
      });
    },
    []
  );

  const handleFinancialDataLoad = useCallback(
    (data: {
      overview?: Record<string, unknown>;
      financials?: Record<string, unknown>;
    }) => {
      setFinancialData(data);
    },
    []
  );

  // Filter handlers
  const handleFilterApply = async (criteria: FilterCriteria) => {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      const response = await fetch(`${baseUrl}/api/screener/filter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_types:
            criteria.assetTypes.length > 0 ? criteria.assetTypes : null,
          market_cap_min: criteria.marketCapMin,
          market_cap_max: criteria.marketCapMax,
          sic_codes: criteria.sicCodes.length > 0 ? criteria.sicCodes : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFilteredTickers(new Set(data.tickers));

        // Count active filters
        let count = 0;
        if (criteria.assetTypes.length > 0) count++;
        if (criteria.marketCapMin !== null || criteria.marketCapMax !== null)
          count++;
        if (criteria.sicCodes.length > 0) count++;
        setActiveFilterCount(count);

        console.log(
          `✅ Applied filters: ${data.count} tickers match criteria`,
          "\n  Asset types:",
          criteria.assetTypes.length > 0 ? criteria.assetTypes : "any",
          "\n  Market cap:",
          criteria.marketCapMin || criteria.marketCapMax
            ? `${criteria.marketCapMin || 0} - ${criteria.marketCapMax || "∞"}`
            : "any",
          "\n  SIC codes:",
          criteria.sicCodes.length > 0 ? criteria.sicCodes : "any",
          "\n  Matched tickers:",
          data.tickers.slice(0, 10).join(", ") + (data.count > 10 ? "..." : "")
        );
      } else {
        console.error("Failed to apply filters:", await response.text());
      }
    } catch (error) {
      console.error("Error applying filters:", error);
    }
  };

  const handleFilterClear = () => {
    setFilteredTickers(null);
    setActiveFilterCount(0);
  };

  // Apply client-side filtering to WebSocket stocks
  const displayedStocks = filteredTickers
    ? (stocks || []).filter((stock) => filteredTickers.has(stock.ticker))
    : stocks || [];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full w-full">
        {/* Stock List - Narrower (2 columns) */}
        <div className="lg:col-span-2 h-full max-h-full overflow-hidden">
          <Card className="h-full flex flex-col max-h-full">
            <CardHeader className="pb-2 px-3 pt-3 flex-shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CardTitle className="flex items-center gap-2 cursor-help text-sm">
                        Screener
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isConnected ? "bg-green-500" : "bg-red-500"
                          }`}
                          title={isConnected ? "Connected" : "Disconnected"}
                        />
                      </CardTitle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Real-time stock monitoring. Click to view details.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  {error && (
                    <span className="block text-red-500 text-xs">
                      Error: {error}
                    </span>
                  )}
                </div>
                <TickerFilterMenu
                  onFilterApply={handleFilterApply}
                  onFilterClear={handleFilterClear}
                  activeFilterCount={activeFilterCount}
                />
              </div>
              {/* Timeframe filter buttons - Wrap if needed */}
              <div className="flex flex-wrap gap-1">
                {(Object.keys(TIMEFRAME_LABELS) as TimeframeFilter[]).map(
                  (timeframe) => (
                    <CardActionButton
                      key={timeframe}
                      variant={
                        selectedTimeframe === timeframe ? "default" : "outline"
                      }
                      onClick={() => handleTimeframeChange(timeframe)}
                    >
                      {TIMEFRAME_LABELS[timeframe]}
                    </CardActionButton>
                  )
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs py-1 px-2">Ticker</TableHead>
                    <TableHead className="text-xs py-1 px-1 text-center">
                      Signals
                    </TableHead>
                    <TableHead className="text-xs text-right py-1 px-2">
                      %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedStocks.length === 0 && filteredTickers !== null ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4">
                        <div className="text-xs text-muted-foreground">
                          <div className="font-medium">No matches</div>
                          <div className="text-[10px] mt-1">
                            Try different filters
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : displayedStocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4">
                        <div className="text-xs text-muted-foreground">
                          Waiting for data...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedStocks.map((stock) => (
                      <TableRow
                        key={stock.ticker}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          selectedStock === stock.ticker ? "bg-muted" : ""
                        }`}
                        onClick={() => handleStockClick(stock.ticker)}
                      >
                        <TableCell className="font-medium text-xs py-1.5 px-2">
                          {stock.ticker}
                        </TableCell>
                        <TableCell className="py-1.5 px-1">
                          <div className="flex justify-center">
                            <CompactSignalBar stock={stock} />
                          </div>
                        </TableCell>
                        <TableCell
                          className={`text-right text-xs py-1.5 px-2 font-medium ${
                            stock.changePercent >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {stock.changePercent >= 0 ? "+" : ""}
                          {stock.changePercent.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Chart, Trade, and News Panel - Always Visible, Wider (10 columns) */}
        <div className="lg:col-span-10 h-full flex flex-col gap-2">
          {/* Ticker Input Search */}
          <form onSubmit={handleTickerInputSubmit} className="flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter ticker symbol (e.g., AAPL, TSLA)..."
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                className="pl-10"
              />
            </div>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">
            {/* Chart - Takes up 2/3 of the space */}
            <div className="lg:col-span-2 h-full min-h-[500px]">
              {selectedStock ? (
                <NocRealtimeChart
                  symbol={selectedStock}
                  onSymbolChange={(newSymbol) => {
                    setSelectedStock(newSymbol);
                    router.push(`/?ticker=${newSymbol}`, { scroll: false });
                  }}
                  onCaptureChart={async () => {
                    if (chartCaptureRef.current) {
                      return await chartCaptureRef.current();
                    }
                    throw new Error("Chart capture not available");
                  }}
                />
              ) : (
                <Card className="h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg mb-2">
                      Select a stock or enter a ticker above
                    </p>
                    <p className="text-sm">
                      Click a stock from the screener or type a symbol
                    </p>
                  </div>
                </Card>
              )}
            </div>

            {/* Trade and News Cards - Stack vertically, takes up 1/3 of the space */}
            <div className="lg:col-span-1 h-full flex flex-col gap-2">
              {/* Trade Card */}
              <div className="flex-shrink-0" style={{ maxHeight: "40%" }}>
                {selectedStock ? (
                  <TradeCard
                    ticker={selectedStock}
                    onCaptureChart={async () => {
                      const captureFunc = (
                        window as Window & {
                          __captureChartForTrading?: () => Promise<string>;
                        }
                      ).__captureChartForTrading;
                      if (captureFunc) {
                        return await captureFunc();
                      }
                      throw new Error("Chart capture not available");
                    }}
                    newsData={newsData}
                    financialData={financialData}
                  />
                ) : (
                  <Card className="h-full flex items-center justify-center">
                    <div className="text-xs text-muted-foreground">
                      No stock selected
                    </div>
                  </Card>
                )}
              </div>

              {/* News Card */}
              <div className="flex-1 min-h-0" style={{ maxHeight: "60%" }}>
                {selectedStock ? (
                  <NewsCard
                    ticker={selectedStock}
                    onNewsLoad={handleNewsLoad}
                  />
                ) : (
                  <Card className="h-full flex items-center justify-center">
                    <div className="text-xs text-muted-foreground">
                      No stock selected
                    </div>
                  </Card>
                )}
              </div>

              {/* Hidden Financial Info Panel for data collection */}
              {selectedStock && (
                <div style={{ display: "none" }}>
                  <FinancialInfoPanel
                    ticker={selectedStock}
                    onDataLoad={handleFinancialDataLoad}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
