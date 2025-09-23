"use client";

import { AlertTriangle, DollarSign, TestTube } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { useTradingContext } from "../contexts/trading-context";

export function TradingEnvironmentToggle() {
  const {
    environment,
    setEnvironment,
    isPaperTrading,
    availableEnvironments,
    environmentLabel,
    environmentDescription,
  } = useTradingContext();

  // Don't show toggle if user only has access to one environment
  if (availableEnvironments.length <= 1) {
    return null;
  }

  return (
    <Card
      className={`border-2 ${
        isPaperTrading
          ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
          : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPaperTrading ? (
              <TestTube className="h-6 w-6 text-blue-600" />
            ) : (
              <DollarSign className="h-6 w-6 text-red-600" />
            )}
            <div>
              <CardTitle className="text-lg">{environmentLabel}</CardTitle>
              <CardDescription className="text-sm">
                {environmentDescription}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isPaperTrading
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              {isPaperTrading ? "SAFE" : "REAL MONEY"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEnvironment(isPaperTrading ? "live" : "paper")}
              className={
                isPaperTrading
                  ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  : "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950"
              }
            >
              {isPaperTrading ? "Switch to Live" : "Switch to Paper"}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isPaperTrading && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 rounded-md bg-red-100 p-3 text-red-800 dark:bg-red-900 dark:text-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <p className="text-sm">
              <strong>Warning:</strong> You are trading with real money. All
              trades will use actual funds from your account.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
