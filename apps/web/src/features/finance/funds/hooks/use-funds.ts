/**
 * useFunds Hook
 *
 * Hook for managing funds CRUD operations.
 */

import { useCallback, useEffect, useState } from "react";

import { fundService } from "../services/fund-service";
import { CreateFundInput, Fund, UpdateFundInput } from "../types";

export function useFunds() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFunds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fundService.getFunds();
      setFunds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load funds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFunds();
  }, [loadFunds]);

  const createFund = useCallback(
    async (input: CreateFundInput): Promise<Fund> => {
      try {
        setError(null);
        const newFund = await fundService.createFund(input);
        setFunds((prev) => [...prev, newFund]);
        return newFund;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create fund";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    []
  );

  const updateFund = useCallback(
    async (id: string, input: UpdateFundInput): Promise<Fund> => {
      try {
        setError(null);
        const updatedFund = await fundService.updateFund(id, input);
        setFunds((prev) => prev.map((f) => (f.id === id ? updatedFund : f)));
        return updatedFund;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update fund";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    []
  );

  const deleteFund = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      await fundService.deleteFund(id);
      setFunds((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete fund";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  return {
    funds,
    loading,
    error,
    createFund,
    updateFund,
    deleteFund,
    refresh: loadFunds,
  };
}
