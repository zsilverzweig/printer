// React hook for managing company research
"use client";

import { useCallback, useEffect, useState } from "react";

import { log } from "@/lib/utils/logger";

import {
  CompanyResearch,
  CreateCompanyResearchRequest,
  UseCompanyResearchReturn,
} from "../types";

export function useCompanyResearch(userId: string): UseCompanyResearchReturn {
  const [research, setResearch] = useState<CompanyResearch[]>([]);
  const [selectedResearch, setSelectedResearch] = useState<CompanyResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadResearch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/research/company`);
      if (!response.ok) {
        throw new Error("Failed to fetch company research");
      }

      const data = await response.json();
      setResearch(data.research || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load company research";
      setError(errorMessage);
      log.error("Failed to load company research", err, "useCompanyResearch");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    if (userId) {
      loadResearch();
    }
  }, [userId, loadResearch]);

  const createResearch = useCallback(
    async (request: CreateCompanyResearchRequest): Promise<CompanyResearch> => {
      try {
        setCreating(true);
        setError(null);

        const response = await fetch("/api/research/company", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create company research");
        }

        const data = await response.json();
        const newResearch = data.research;
        
        setResearch((prev) => [newResearch, ...prev]);
        
        log.success(
          `Company research created: ${newResearch.companyTicker}`,
          undefined,
          "useCompanyResearch"
        );
        
        return newResearch;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create company research";
        setError(errorMessage);
        log.error("Failed to create company research", err, "useCompanyResearch");
        throw err;
      } finally {
        setCreating(false);
      }
    },
    []
  );

  const getResearch = useCallback(async (id: string): Promise<CompanyResearch | null> => {
    try {
      setError(null);
      const response = await fetch(`/api/research/company/${id}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch research");
      }

      const data = await response.json();
      return data.research;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get research";
      setError(errorMessage);
      log.error("Failed to get research", err, "useCompanyResearch");
      return null;
    }
  }, []);

  const searchResearch = useCallback(async (query: string): Promise<CompanyResearch[]> => {
    try {
      setSearching(true);
      setError(null);

      const response = await fetch(`/api/research/company/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("Failed to search research");
      }

      const data = await response.json();
      return data.research || [];
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to search research";
      setError(errorMessage);
      log.error("Failed to search research", err, "useCompanyResearch");
      return [];
    } finally {
      setSearching(false);
    }
  }, []);

  const deleteResearch = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      const response = await fetch(`/api/research/company/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete research");
      }

      setResearch((prev) => prev.filter((item) => item.id !== id));
      
      // Clear selection if deleted research was selected
      if (selectedResearch?.id === id) {
        setSelectedResearch(null);
      }

      log.success(
        `Research deleted: ${id}`,
        undefined,
        "useCompanyResearch"
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete research";
      setError(errorMessage);
      log.error("Failed to delete research", err, "useCompanyResearch");
      throw err;
    }
  }, [selectedResearch]);

  const selectResearch = useCallback((research: CompanyResearch | null) => {
    setSelectedResearch(research);
  }, []);

  const refreshResearch = useCallback(async () => {
    await loadResearch();
  }, [loadResearch]);

  return {
    // Data
    research,
    selectedResearch,
    
    // Loading states
    loading,
    creating,
    searching,
    
    // Error handling
    error,
    
    // Actions
    createResearch,
    getResearch,
    searchResearch,
    deleteResearch,
    
    // UI state
    selectResearch,
    refreshResearch,
  };
}
