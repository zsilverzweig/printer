import { useCallback, useState } from "react";

import { apiService } from "@/lib/services/api-service";

export interface RefineThesisResult {
  thesis_title: string;
  thesis_description: string;
  rationale: string;
}

export interface UseThesisReturn {
  // Loading state
  refiningThesis: boolean;
  
  // Error handling
  error: string | null;
  
  // Actions
  refineThesis: (thesis: string) => Promise<RefineThesisResult>;
  
  // Clear error
  clearError: () => void;
}

export function useThesis(): UseThesisReturn {
  const [refiningThesis, setRefiningThesis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refineThesis = useCallback(
    async (thesis: string): Promise<RefineThesisResult> => {
      try {
        setRefiningThesis(true);
        setError(null);
        
        const result = await apiService.post('/api/agents/refine-thesis', { thesis });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to refine thesis";
        setError(errorMessage);
        throw err;
      } finally {
        setRefiningThesis(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    refiningThesis,
    error,
    refineThesis,
    clearError,
  };
}