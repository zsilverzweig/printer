"use client";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { Card, CardContent } from "@/lib/components/ui/card";
import { AlertTriangle, DollarSign, TestTube } from "lucide-react";
import { useTradingContext } from "../contexts/trading-context";

export function TradingEnvironmentBanner() {
  const {
    environment,
    setEnvironment,
    environmentLabel,
    environmentColor,
    environmentDescription,
    hasBothEnvironments,
    availableEnvironments,
  } = useTradingContext();

  const isPaperTrading = environment === "paper";
  const isLiveTrading = environment === "live";

  return (
    <Card
      className={`border-2 ${
        isPaperTrading
          ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
          : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPaperTrading ? (
              <TestTube className="h-6 w-6 text-blue-600" />
            ) : (
              <DollarSign className="h-6 w-6 text-red-600" />
            )}

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{environmentLabel}</h3>
                <Badge
                  variant={isPaperTrading ? "secondary" : "destructive"}
                  className="text-xs"
                >
                  {isPaperTrading ? "SAFE" : "REAL MONEY"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {environmentDescription}
              </p>
            </div>
          </div>

          {hasBothEnvironments && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Switch to:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEnvironment(isPaperTrading ? "live" : "paper")
                }
                className={
                  isPaperTrading
                    ? "border-red-200 text-red-700 hover:bg-red-50"
                    : "border-blue-200 text-blue-700 hover:bg-blue-50"
                }
              >
                {isPaperTrading ? (
                  <>
                    <DollarSign className="h-4 w-4 mr-1" />
                    Live Trading
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-1" />
                    Paper Trading
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {isLiveTrading && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-red-100 p-2 dark:bg-red-900/20">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>Warning:</strong> You are trading with real money. All
              trades will use actual funds from your account.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
