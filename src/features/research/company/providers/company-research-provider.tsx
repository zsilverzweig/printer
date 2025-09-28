"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";

import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  QuerySnapshot,
  DocumentData 
} from "firebase/firestore";

import { db, COLLECTIONS } from "@/lib/services/firebase";
import { log } from "@/lib/utils/logger";

import { CompanyResearch } from "../types";
import { deserializeCompanyResearch } from "@/features/ai/agents/services/firestore/converters";

export interface CompanyResearchContextType {
  // Data
  research: CompanyResearch[];
  selectedResearch: CompanyResearch | null;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Actions
  selectResearch: (research: CompanyResearch | null) => void;
  refreshResearch: () => void;
}

const CompanyResearchContext = createContext<CompanyResearchContextType | undefined>(undefined);

interface CompanyResearchProviderProps {
  userId: string;
  children: ReactNode;
}

export function CompanyResearchProvider({ userId, children }: CompanyResearchProviderProps) {
  const [research, setResearch] = useState<CompanyResearch[]>([]);
  const [selectedResearch, setSelectedResearch] = useState<CompanyResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedResearchRef = useRef<CompanyResearch | null>(null);

  useEffect(() => {
    if (!userId) {
      setResearch([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    log.info("Setting up company research real-time listener", { userId }, "CompanyResearchProvider");

    // Create Firestore query for user's research, ordered by creation date (newest first)
    // Note: For now, let's try without orderBy to see if that's causing issues
    const q = query(
      collection(db, COLLECTIONS.COMPANY_RESEARCH),
      where("userId", "==", userId)
      // orderBy("createdAt", "desc") // Temporarily removed to test if this causes issues
    );

    // Set up real-time listener
    console.log("Setting up Firestore listener for company research", { userId, query: q });
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        try {
          console.log("Firestore snapshot received", {
            docsCount: snapshot.docs.length,
            userId,
            docs: snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }))
          });

          const researchData: CompanyResearch[] = snapshot.docs.map((doc) => 
            deserializeCompanyResearch(doc.id, doc.data())
          );

          // Sort by creation date (newest first) since we removed orderBy from query
          researchData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          console.log("Deserialized research data", {
            count: researchData.length,
            research: researchData.map(r => ({ id: r.id, ticker: r.companyTicker, status: r.status }))
          });

          setResearch(researchData);
          setError(null);

          log.info("Company research data updated", {
            count: researchData.length,
            userId,
            statuses: researchData.map(r => ({ id: r.id, ticker: r.companyTicker, status: r.status }))
          }, "CompanyResearchProvider");

          // If we have a selected research, update it with the latest data
          if (selectedResearchRef.current) {
            const updatedSelected = researchData.find(r => r.id === selectedResearchRef.current?.id);
            if (updatedSelected) {
              console.log("Updating selected research", {
                oldStatus: selectedResearchRef.current.status,
                newStatus: updatedSelected.status,
                researchId: selectedResearchRef.current.id
              });
              setSelectedResearch(updatedSelected);
            }
          }

        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Failed to process research data";
          setError(errorMessage);
          console.error("Error processing company research data", err);
          log.error("Error processing company research data", err, "CompanyResearchProvider");
        }
      },
      (err) => {
        const errorMessage = err instanceof Error ? err.message : "Failed to listen to research updates";
        setError(errorMessage);
        setLoading(false);
        console.error("Company research listener error", err);
        log.error("Company research listener error", err, "CompanyResearchProvider");
      }
    );

    setLoading(false);

    // Cleanup listener on unmount
    return () => {
      log.info("Cleaning up company research listener", { userId }, "CompanyResearchProvider");
      unsubscribe();
    };
  }, [userId]); // Removed selectedResearch from dependency array to prevent multiple listeners

  const selectResearch = (research: CompanyResearch | null) => {
    selectedResearchRef.current = research;
    setSelectedResearch(research);
  };

  const refreshResearch = () => {
    // With real-time listeners, we don't need manual refresh
    // But we can trigger a re-render by updating state
    log.info("Manual refresh requested", { researchCount: research.length }, "CompanyResearchProvider");
  };

  const value: CompanyResearchContextType = {
    // Data
    research,
    selectedResearch,
    
    // Loading states
    loading,
    error,
    
    // Actions
    selectResearch,
    refreshResearch,
  };

  return (
    <CompanyResearchContext.Provider value={value}>
      {children}
    </CompanyResearchContext.Provider>
  );
}

export function useCompanyResearchContext(): CompanyResearchContextType {
  const context = useContext(CompanyResearchContext);
  if (context === undefined) {
    throw new Error("useCompanyResearchContext must be used within a CompanyResearchProvider");
  }
  return context;
}
