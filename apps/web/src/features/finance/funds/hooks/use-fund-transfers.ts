/**
 * useFundTransfers Hook
 *
 * Hook for managing fund transfers.
 */

import { useCallback, useEffect, useState } from "react";

import { transferService } from "../services/transfer-service";
import { CreateTransferInput, FundTransfer } from "../types";

export function useFundTransfers(fundId: string | null) {
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransfers = useCallback(async () => {
    if (!fundId) {
      setTransfers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await transferService.getTransfersByFundId(fundId);
      setTransfers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const createTransfer = useCallback(
    async (input: CreateTransferInput): Promise<FundTransfer> => {
      try {
        setError(null);
        const newTransfer = await transferService.createTransfer(input);
        setTransfers((prev) => [newTransfer, ...prev]);
        return newTransfer;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create transfer";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    []
  );

  return {
    transfers,
    loading,
    error,
    createTransfer,
    refresh: loadTransfers,
  };
}
