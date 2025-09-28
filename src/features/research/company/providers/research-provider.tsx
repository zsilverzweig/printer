"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";

import { log } from "@/lib/utils/logger";

import { CompanyResearchResult } from "../services/research-service";

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

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

interface ResearchProviderProps {
  userId: string;
  children: ReactNode;
}

export function ResearchProvider({ userId, children }: ResearchProviderProps) {
  const [researchResults, setResearchResults] = useState<CompanyResearchResult[]>([]);
  const [selectedResearch, setSelectedResearch] = useState<CompanyResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedResearchRef = useRef<CompanyResearchResult | null>(null);

  useEffect(() => {
    if (!userId) {
      setResearchResults([]);
      setSelectedResearch(null);
      setLoading(false);
      return;
    }

    log.info("Research provider initialized", { userId }, "ResearchProvider");
  }, [userId]);

  const addResearchResult = (result: CompanyResearchResult) => {
    setResearchResults(prev => {
      // Remove any existing research for the same ticker and add the new one at the beginning
      const filtered = prev.filter(r => r.ticker !== result.ticker);
      const updated = [result, ...filtered];
      
      log.info("Research result added", { 
        ticker: result.ticker,
        companyName: result.companyName,
        totalResults: updated.length 
      }, "ResearchProvider");
      
      return updated;
    });
    
    // Auto-select the new research result
    setSelectedResearch(result);
    selectedResearchRef.current = result;
  };

  const selectResearch = (research: CompanyResearchResult | null) => {
    selectedResearchRef.current = research;
    setSelectedResearch(research);
    
    log.debug("Research selected", { 
      ticker: research?.ticker,
      companyName: research?.companyName 
    }, "ResearchProvider");
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
    throw new Error("useResearchContext must be used within a ResearchProvider");
  }
  return context;
}
