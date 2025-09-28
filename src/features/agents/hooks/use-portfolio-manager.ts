// React hook for Portfolio Manager agent
"use client";

import { useCallback, useState } from "react";

import { log } from "@/lib/utils/logger";

import { PortfolioManagerAgent } from "../agents/portfolio-manager/portfolio-manager";
import { 
  GeneratePortfolioInput, 
  GeneratePortfolioOutput,
  RefineThesisInput,
  RefineThesisOutput 
} from "../agents/portfolio-manager/types/work-types";

interface UsePortfolioManagerReturn {
  // Generate Portfolio
  generatePortfolio: (input: GeneratePortfolioInput) => Promise<GeneratePortfolioOutput>;
  isGeneratingPortfolio: boolean;
  generatePortfolioError: string | null;

  // Refine Investment Thesis
  refineInvestmentThesis: (input: RefineThesisInput) => Promise<RefineThesisOutput>;
  isRefiningThesis: boolean;
  refineThesisError: string | null;

  // Agent info
  agentId: string;
  agentName: string;
  workTypes: string[];
}

export function usePortfolioManager(): UsePortfolioManagerReturn {
  const [portfolioManager] = useState(() => new PortfolioManagerAgent());
  
  const [isGeneratingPortfolio, setIsGeneratingPortfolio] = useState(false);
  const [generatePortfolioError, setGeneratePortfolioError] = useState<string | null>(null);
  
  const [isRefiningThesis, setIsRefiningThesis] = useState(false);
  const [refineThesisError, setRefineThesisError] = useState<string | null>(null);

  const generatePortfolio = useCallback(async (input: GeneratePortfolioInput): Promise<GeneratePortfolioOutput> => {
    setIsGeneratingPortfolio(true);
    setGeneratePortfolioError(null);

    try {
      log.info("usePortfolioManager: Generate portfolio requested", {
        thesisLength: input.thesis.length,
        riskTolerance: input.riskTolerance
      }, "usePortfolioManager");

      const result = await portfolioManager.generatePortfolio(input, "current-user"); // TODO: Get actual user ID
      
      log.success("usePortfolioManager: Generate portfolio completed", {
        positionsCount: result.positions.length
      }, "usePortfolioManager");

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate portfolio";
      setGeneratePortfolioError(errorMessage);
      log.error("usePortfolioManager: Generate portfolio failed", error, "usePortfolioManager");
      throw error;
    } finally {
      setIsGeneratingPortfolio(false);
    }
  }, [portfolioManager]);

  const refineInvestmentThesis = useCallback(async (input: RefineThesisInput): Promise<RefineThesisOutput> => {
    setIsRefiningThesis(true);
    setRefineThesisError(null);

    try {
      log.info("usePortfolioManager: Refine thesis requested", {
        thesisLength: input.thesis.length
      }, "usePortfolioManager");

      const result = await portfolioManager.refineInvestmentThesis(input, "current-user"); // TODO: Get actual user ID
      
      log.success("usePortfolioManager: Refine thesis completed", {
        originalLength: input.thesis.length,
        refinedLength: result.refined_thesis.length
      }, "usePortfolioManager");

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to refine thesis";
      setRefineThesisError(errorMessage);
      log.error("usePortfolioManager: Refine thesis failed", error, "usePortfolioManager");
      throw error;
    } finally {
      setIsRefiningThesis(false);
    }
  }, [portfolioManager]);

  return {
    // Generate Portfolio
    generatePortfolio,
    isGeneratingPortfolio,
    generatePortfolioError,

    // Refine Investment Thesis
    refineInvestmentThesis,
    isRefiningThesis,
    refineThesisError,

    // Agent info
    agentId: portfolioManager.getAgent().id,
    agentName: portfolioManager.getAgent().name,
    workTypes: portfolioManager.getWorkTypes(),
  };
}
