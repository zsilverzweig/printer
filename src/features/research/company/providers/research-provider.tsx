"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { COLLECTIONS, db } from "@/lib/services/firebase";
import { log } from "@/lib/utils/logger";

import { CompanyResearchResult } from "../services/research-service";
import { CompanyResearch as CRUDocument } from "../types";

export interface ResearchContextType {
  // Data
  researchResults: CompanyResearchResult[];
  selectedResearch: CompanyResearchResult | null;
  userId: string;

  // Loading states
  loading: boolean;
  error: string | null;

  // Actions
  addResearchResult: (result: CompanyResearchResult) => void;
  selectResearch: (research: CompanyResearchResult | null) => void;
  clearResearch: () => void;
  clearError: () => void;
}

const ResearchContext = createContext<ResearchContextType | undefined>(
  undefined
);

interface ResearchProviderProps {
  userId: string;
  children: ReactNode;
}

export function ResearchProvider({ userId, children }: ResearchProviderProps) {
  const [researchResults, setResearchResults] = useState<
    CompanyResearchResult[]
  >([]);
  const [selectedResearch, setSelectedResearch] =
    useState<CompanyResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedResearchRef = useRef<CompanyResearchResult | null>(null);

  // Helper: coerce Firestore Timestamp/Date/ISO string into Date
  function coerceDate(input: unknown): Date {
    if (!input) return new Date();
    if (input instanceof Date) return input;
    if (typeof input === "string") {
      const parsed = new Date(input);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    const maybeTs = input as { toDate?: () => Date };
    if (
      maybeTs &&
      typeof maybeTs === "object" &&
      typeof maybeTs.toDate === "function"
    ) {
      try {
        return maybeTs.toDate() as Date;
      } catch {
        return new Date();
      }
    }
    return new Date();
  }

  useEffect(() => {
    if (!userId) {
      setResearchResults([]);
      setSelectedResearch(null);
      setLoading(false);
      return;
    }

    log.info(
      "Research provider initializing subscription",
      { userId },
      "ResearchProvider"
    );
    setLoading(true);

    const q = query(
      collection(db, COLLECTIONS.COMPANY_RESEARCH),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: CompanyResearchResult[] = snapshot.docs
          .map((doc) => {
            const d = doc.data() as Partial<CRUDocument> & {
              createdAt?: unknown;
              updatedAt?: unknown;
            };
            // CRU-only mapping
            const summary =
              d?.background?.summary ?? d?.synthesis?.synthesis ?? "";
            const report =
              d?.background?.report ?? d?.synthesis?.synthesis ?? "";

            const createdAt = coerceDate(d?.createdAt);
            const updatedAt = coerceDate(d?.updatedAt ?? d?.createdAt);

            const result: CompanyResearchResult = {
              id: doc.id,
              userId: d?.userId,
              ticker: d?.companyTicker ?? "",
              companyName: d?.companyName ?? d?.companyTicker ?? "",
              summary,
              report,
              recommendation: d?.recommendation ?? "",
              status: d?.status ?? "in_progress",
              isComplete: Boolean(d?.isComplete),
              createdAt,
              updatedAt,
            };
            return result;
          })
          // Filter out any legacy non-CRU docs defensively (require companyTicker or background/recentNews/synthesis/status)
          .filter((r) => !!r.ticker || !!r.status);

        items.sort(
          (a, b) =>
            (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)
        );

        setResearchResults(items);

        // Keep selection if still present, else select latest completed or latest item
        const currentId = selectedResearchRef.current?.id;
        const stillExists = items.find((i) => i.id === currentId) || null;
        if (stillExists) {
          setSelectedResearch(stillExists);
        } else {
          const preferred = items.find((i) => i.isComplete) ?? items[0] ?? null;
          setSelectedResearch(preferred || null);
          selectedResearchRef.current = preferred || null;
        }

        setLoading(false);
      },
      (error) => {
        log.error("Research subscription error", error, "ResearchProvider");
        setError(error.message || "Failed to load research");
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [userId]);

  const addResearchResult = (result: CompanyResearchResult) => {
    setResearchResults((prev) => {
      // Remove any existing research for the same ticker and add the new one at the beginning
      const filtered = prev.filter((r) => r.ticker !== result.ticker);
      const updated = [result, ...filtered];

      log.info(
        "Research result added",
        {
          ticker: result.ticker,
          companyName: result.companyName,
          totalResults: updated.length,
        },
        "ResearchProvider"
      );

      return updated;
    });

    // Auto-select the new research result
    setSelectedResearch(result);
    selectedResearchRef.current = result;
  };

  const selectResearch = (research: CompanyResearchResult | null) => {
    selectedResearchRef.current = research;
    setSelectedResearch(research);

    log.debug(
      "Research selected",
      {
        ticker: research?.ticker,
        companyName: research?.companyName,
      },
      "ResearchProvider"
    );
  };

  const clearResearch = () => {
    setResearchResults([]);
    setSelectedResearch(null);
    selectedResearchRef.current = null;

    log.info("Research cleared", { userId }, "ResearchProvider");
  };

  const clearError = () => {
    setError(null);
  };

  const value: ResearchContextType = {
    // Data
    researchResults,
    selectedResearch,
    userId,

    // Loading states
    loading,
    error,

    // Actions
    addResearchResult,
    selectResearch,
    clearResearch,
    clearError,
  };

  return (
    <ResearchContext.Provider value={value}>
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearchContext(): ResearchContextType {
  const context = useContext(ResearchContext);
  if (context === undefined) {
    throw new Error(
      "useResearchContext must be used within a ResearchProvider"
    );
  }
  return context;
}
