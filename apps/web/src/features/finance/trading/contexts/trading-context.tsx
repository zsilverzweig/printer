"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useAuthContext } from "@/lib/providers/auth-provider";
import { log } from "@/lib/utils/logger";

export type TradingEnvironment = "paper" | "live";

export interface TradingContextType {
  environment: TradingEnvironment;
  setEnvironment: (env: TradingEnvironment) => void;
  isPaperTrading: boolean;
  isLiveTrading: boolean;
  environmentLabel: string;
  environmentColor: string;
  environmentDescription: string;
  hasBothEnvironments: boolean;
  availableEnvironments: TradingEnvironment[];
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

interface TradingProviderProps {
  children: React.ReactNode;
}

export function TradingProvider({ children }: TradingProviderProps) {
  const { user } = useAuthContext();
  const [environment, setEnvironmentState] =
    useState<TradingEnvironment>("paper");

  // Check if user has both paper and live trading access
  const hasBothEnvironments = user?.alpacaConnection?.environment === "both";
  const availableEnvironments: TradingEnvironment[] = hasBothEnvironments
    ? ["paper", "live"]
    : user?.alpacaConnection?.environment === "paper"
    ? ["paper"]
    : user?.alpacaConnection?.environment === "live"
    ? ["live"]
    : [];

  // Set default environment based on user's connection
  useEffect(() => {
    if (user?.alpacaConnection?.environment) {
      if (user.alpacaConnection.environment === "both") {
        // Default to paper for safety
        setEnvironmentState("paper");
      } else {
        setEnvironmentState(
          user.alpacaConnection.environment as TradingEnvironment
        );
      }
    }
  }, [user?.alpacaConnection?.environment]);

  const setEnvironment = useCallback(
    (env: TradingEnvironment) => {
      log.info(
        "Trading environment changed",
        {
          userId: user?.uid,
          from: environment,
          to: env,
          availableEnvironments,
        },
        "TradingContext"
      );
      setEnvironmentState(env);
    },
    [environment, user?.uid, availableEnvironments]
  );

  const isPaperTrading = environment === "paper";
  const isLiveTrading = environment === "live";

  const environmentLabel = isPaperTrading ? "Paper Trading" : "Live Trading";
  const environmentColor = isPaperTrading ? "blue" : "red";
  const environmentDescription = isPaperTrading
    ? "Practice trading with virtual money - no real funds at risk"
    : "Real money trading - actual funds will be used";

  const value: TradingContextType = {
    environment,
    setEnvironment,
    isPaperTrading,
    isLiveTrading,
    environmentLabel,
    environmentColor,
    environmentDescription,
    hasBothEnvironments,
    availableEnvironments,
  };

  return (
    <TradingContext.Provider value={value}>{children}</TradingContext.Provider>
  );
}

export function useTradingContext(): TradingContextType {
  const context = useContext(TradingContext);
  if (context === undefined) {
    throw new Error("useTradingContext must be used within a TradingProvider");
  }
  return context;
}
