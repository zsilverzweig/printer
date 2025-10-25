"use client";

import { AlertCircle, CheckCircle2, Loader2, TrendingUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

interface TradingDecision {
  action: "buy" | "hold" | "sell";
  reasoning: string;
  confidence: number;
  key_factors?: string[];
  risks?: string[];
}

interface TradeResult {
  id: string;
  symbol: string;
  notional: number;
  side: string;
  status: string;
  submitted_at: string;
}

interface TradingAnalysisResponse {
  ticker: string;
  decision: TradingDecision;
  trade_result: TradeResult | null;
  trade_error: string | null;
  timestamp: string;
}

interface TradeCardProps {
  ticker: string;
  onCaptureChart: () => Promise<string>;
  newsData: {
    news_summary?: string;
    key_events?: Array<{
      name: string;
      summary: string;
    }>;
  } | null;
  financialData: {
    overview?: Record<string, any>;
    financials?: Record<string, any>;
  } | null;
}

export function TradeCard({
  ticker,
  onCaptureChart,
  newsData,
  financialData,
}: TradeCardProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<TradingAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      console.log("🔍 [TradeCard] Starting trade analysis for:", ticker);
      
      // Capture chart image
      console.log("📸 [TradeCard] Capturing chart image...");
      const chartImage = await onCaptureChart();
      console.log("✅ [TradeCard] Chart image captured, length:", chartImage.length);

      // Prepare request body
      const requestBody = {
        chart_image: chartImage,
        news_summary: {
          news_summary: newsData?.news_summary || "No news available",
          key_events: newsData?.key_events || [],
        },
        financial_summary: {
          overview: financialData?.overview || {},
          financials: financialData?.financials || {},
        },
      };

      console.log("📦 [TradeCard] Request body prepared:", {
        chart_image_length: chartImage.length,
        has_news: !!newsData?.news_summary,
        key_events_count: newsData?.key_events?.length || 0,
        has_financials: !!financialData?.financials,
      });

      // Send to backend
      const baseUrl =
        process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
          "wss://",
          "https://"
        ) || "http://localhost:8000";

      const fullUrl = `${baseUrl}/trade/analyze/${ticker}`;
      
      console.log("🌐 [TradeCard] Sending POST request to:", fullUrl);
      console.log("🌐 [TradeCard] Base URL source:", {
        NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
        computed_baseUrl: baseUrl,
      });

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📡 [TradeCard] Response received:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ [TradeCard] Error response:", errorData);
        throw new Error(
          errorData.detail || `Failed to analyze: ${response.statusText}`
        );
      }

      const data: TradingAnalysisResponse = await response.json();
      console.log("✅ [TradeCard] Analysis complete:", {
        action: data.decision?.action,
        confidence: data.decision?.confidence,
        has_trade_result: !!data.trade_result,
        trade_error: data.trade_error,
      });
      
      setResult(data);
    } catch (err) {
      console.error("❌ [TradeCard] Analysis failed:", err);
      console.error("❌ [TradeCard] Error details:", {
        name: err instanceof Error ? err.name : "Unknown",
        message: err instanceof Error ? err.message : "Failed to analyze trade",
        stack: err instanceof Error ? err.stack : undefined,
      });
      setError(err instanceof Error ? err.message : "Failed to analyze trade");
    } finally {
      setIsAnalyzing(false);
      console.log("🏁 [TradeCard] Analysis complete (finally block)");
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "buy":
        return "bg-green-500";
      case "sell":
        return "bg-red-500";
      case "hold":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "buy":
        return <TrendingUp className="h-4 w-4" />;
      case "sell":
        return <TrendingUp className="h-4 w-4 rotate-180" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            AI Trading Analysis
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="h-7 px-3 text-xs"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Analyze & Trade"
            )}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-xs text-destructive">{error}</div>
            </div>
          </div>
        )}

        {!result && !error && !isAnalyzing && (
          <div className="text-xs text-muted-foreground text-center py-8">
            Click "Analyze & Trade" to get AI-powered trading recommendations
            based on chart patterns, news, and financial data.
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-xs text-muted-foreground text-center">
              <div>Analyzing chart patterns...</div>
              <div className="mt-1">Evaluating news sentiment...</div>
              <div className="mt-1">Checking financial health...</div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {/* Decision Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  className={`${getActionColor(
                    result.decision.action
                  )} text-white`}
                >
                  <span className="flex items-center gap-1">
                    {getActionIcon(result.decision.action)}
                    {result.decision.action.toUpperCase()}
                  </span>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Confidence: {(result.decision.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Reasoning */}
            <div className="space-y-1">
              <h4 className="text-xs font-medium">Analysis</h4>
              <div className="bg-muted p-2 rounded-lg">
                <p className="text-xs leading-relaxed">
                  {result.decision.reasoning}
                </p>
              </div>
            </div>

            {/* Key Factors */}
            {result.decision.key_factors &&
              result.decision.key_factors.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium">Key Factors</h4>
                  <ul className="space-y-1">
                    {result.decision.key_factors.map((factor, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-muted-foreground flex items-start gap-1"
                      >
                        <span className="text-green-500 mt-0.5">•</span>
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Risks */}
            {result.decision.risks && result.decision.risks.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-medium">Risks</h4>
                <ul className="space-y-1">
                  {result.decision.risks.map((risk, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-muted-foreground flex items-start gap-1"
                    >
                      <span className="text-red-500 mt-0.5">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Trade Execution Result */}
            {result.trade_result && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 flex-1">
                    <div className="text-xs font-medium text-green-800 dark:text-green-200">
                      Trade Executed (Paper Trading)
                    </div>
                    <div className="text-xs text-green-700 dark:text-green-300">
                      Placed ${result.trade_result.notional.toFixed(2)} market
                      order for {result.trade_result.symbol}
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">
                      Status: {result.trade_result.status}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Trade Error */}
            {result.trade_error && (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-yellow-800 dark:text-yellow-200">
                    {result.trade_error}
                  </div>
                </div>
              </div>
            )}

            {/* No Trade Explanation */}
            {!result.trade_result &&
              !result.trade_error &&
              result.decision.action !== "buy" && (
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">
                    No trade executed. AI recommends{" "}
                    <strong>{result.decision.action}</strong> with{" "}
                    {(result.decision.confidence * 100).toFixed(0)}% confidence.
                  </div>
                </div>
              )}

            {!result.trade_result &&
              !result.trade_error &&
              result.decision.action === "buy" &&
              result.decision.confidence <= 0.7 && (
                <div className="bg-muted rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">
                    No trade executed. Confidence level (
                    {(result.decision.confidence * 100).toFixed(0)}%) below
                    threshold (70%).
                  </div>
                </div>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
