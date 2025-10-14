"use client";

import {
  collection,
  DocumentData,
  onSnapshot,
  query,
  QuerySnapshot,
  where,
} from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { COLLECTIONS, db } from "@/lib/services/firebase";
import { convertPortfolioDocument } from "@/lib/utils/firebase-converters";
import { log } from "@/lib/utils/logger";

import { Portfolio } from "../types";

export interface PortfolioContextType {
  // Data
  portfolios: Portfolio[];
  selectedPortfolio: Portfolio | null;

  // Loading states
  loading: boolean;
  error: string | null;

  // Actions
  selectPortfolio: (portfolio: Portfolio | null) => void;
  refreshPortfolios: () => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(
  undefined
);

interface PortfolioProviderProps {
  userId: string;
  children: ReactNode;
}

export function PortfolioProvider({
  userId,
  children,
}: PortfolioProviderProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedPortfolioRef = useRef<Portfolio | null>(null);

  useEffect(() => {
    if (!userId) {
      setPortfolios([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    log.info(
      "Setting up portfolio real-time listener",
      { userId },
      "PortfolioProvider"
    );

    // Create Firestore query for user's portfolios, ordered by creation date (newest first)
    const q = query(
      collection(db, COLLECTIONS.PORTFOLIOS),
      where("userId", "==", userId)
      // Temporarily remove orderBy to avoid index issues
      // orderBy("createdAt", "desc")
    );

    // Set up real-time listener
    log.info(
      "Setting up Firestore listener for portfolios",
      { userId },
      "PortfolioProvider"
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        try {
          log.debug(
            "Firestore snapshot received",
            {
              docsCount: snapshot.docs.length,
              userId,
              hasData: snapshot.docs.length > 0,
              firstDoc:
                snapshot.docs.length > 0 ? snapshot.docs[0].data() : null,
            },
            "PortfolioProvider"
          );

          const portfolioData: Portfolio[] = snapshot.docs.map((doc) => {
            try {
              return convertPortfolioDocument({
                id: doc.id,
                data: () => doc.data(),
              });
            } catch (error) {
              log.error(
                "Failed to deserialize portfolio",
                {
                  docId: doc.id,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  data: doc.data(),
                },
                "PortfolioProvider"
              );
              throw error;
            }
          });

          // Sort by creation date (newest first) since we removed orderBy from query
          portfolioData.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );

          log.debug(
            "Deserialized portfolio data",
            {
              count: portfolioData.length,
              portfolios: portfolioData.map((p) => ({
                id: p.id,
                name: p.name,
                status: p.isActive ? "active" : "inactive",
              })),
            },
            "PortfolioProvider"
          );

          setPortfolios(portfolioData);
          setError(null);

          log.info(
            "Portfolio data updated",
            {
              count: portfolioData.length,
              userId,
              portfolios: portfolioData.map((p) => ({
                id: p.id,
                name: p.name,
                positions: p.positions.length,
              })),
            },
            "PortfolioProvider"
          );

          // If we have a selected portfolio, update it with the latest data
          if (selectedPortfolioRef.current) {
            const updatedSelected = portfolioData.find(
              (p) => p.id === selectedPortfolioRef.current?.id
            );
            if (updatedSelected) {
              log.debug(
                "Updating selected portfolio",
                {
                  oldName: selectedPortfolioRef.current.name,
                  newName: updatedSelected.name,
                  portfolioId: selectedPortfolioRef.current.id,
                },
                "PortfolioProvider"
              );
              setSelectedPortfolio(updatedSelected);
            }
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : "Failed to process portfolio data";
          setError(errorMessage);
          log.error(
            "Error processing portfolio data",
            err,
            "PortfolioProvider"
          );
        }
      },
      (err) => {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to listen to portfolio updates";
        setError(errorMessage);
        setLoading(false);
        log.error("Portfolio listener error", err, "PortfolioProvider");
      }
    );

    setLoading(false);

    // Cleanup listener on unmount
    return () => {
      log.info(
        "Cleaning up portfolio listener",
        { userId },
        "PortfolioProvider"
      );
      unsubscribe();
    };
  }, [userId]);

  const selectPortfolio = (portfolio: Portfolio | null) => {
    selectedPortfolioRef.current = portfolio;
    setSelectedPortfolio(portfolio);
  };

  const refreshPortfolios = () => {
    // With real-time listeners, we don't need manual refresh
    // But we can trigger a re-render by updating state
    log.info(
      "Manual refresh requested",
      { portfolioCount: portfolios.length },
      "PortfolioProvider"
    );
  };

  const value: PortfolioContextType = {
    // Data
    portfolios,
    selectedPortfolio,

    // Loading states
    loading,
    error,

    // Actions
    selectPortfolio,
    refreshPortfolios,
  };

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolioContext(): PortfolioContextType {
  const context = useContext(PortfolioContext);
  if (context === undefined) {
    throw new Error(
      "usePortfolioContext must be used within a PortfolioProvider"
    );
  }
  return context;
}
