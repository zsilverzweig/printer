"use client";

import { useCallback, useState } from "react";

import { useAuth } from "@/lib/providers/auth-provider";
import { log } from "@/lib/utils/logger";

import { CompanyResearchAgent } from "../agents/company-research/company-research-agent";
import {
  CompanyResearchInput,
  CompanyResearchOutput,
} from "../agents/company-research/types/work-types";
import { WorkContext } from "../lib/types/work";
import { schemaValidator } from "../lib/utils/schema-validator";

export function useCompanyResearch() {
  const { user } = useAuth();
  const [isResearching, setIsResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const executeWork = useCallback(
    async <TInput, TOutput>(
      workType: string,
      input: TInput,
      companyTicker?: string
    ): Promise<TOutput> => {
      if (!user?.uid) {
        throw new Error("User not authenticated.");
      }

      const workDefinition = CompanyResearchAgent.work.find((w) => w.type === workType);

      if (!workDefinition) {
        throw new Error(`Work type "${workType}" not found for Company Research Agent.`);
      }

      // Validate input against schema
      const { valid, errors } = schemaValidator.validate(workDefinition.inputSchema, input);
      if (!valid) {
        log.error(`Input validation failed for work type "${workType}"`, { errors, input }, "useCompanyResearch");
        throw new Error(`Invalid input for ${workDefinition.name}: ${errors.join(", ")}`);
      }

      const context: WorkContext = {
        userId: user.uid,
        agentId: CompanyResearchAgent.id,
        ...(companyTicker && { companyTicker }),
      };

      try {
        log.info(`Executing work "${workType}"`, { input, context }, "useCompanyResearch");
        const result = await workDefinition.execute(input, context);

        // Validate output against schema
        const { valid: outputValid, errors: outputErrors } = schemaValidator.validate(
          workDefinition.outputSchema,
          result
        );
        if (!outputValid) {
          log.error(`Output validation failed for work type "${workType}"`, { errors: outputErrors, result }, "useCompanyResearch");
          throw new Error(`Invalid output from ${workDefinition.name}: ${outputErrors.join(", ")}`);
        }

        log.success(`Work "${workType}" executed successfully`, { result }, "useCompanyResearch");
        return result as TOutput;
      } catch (error) {
        log.error(`Error executing work "${workType}"`, { error, input, context }, "useCompanyResearch");
        throw error;
      }
    },
    [user?.uid]
  );

  const conductCompanyResearch = useCallback(
    async (input: CompanyResearchInput): Promise<CompanyResearchOutput> => {
      try {
        setIsResearching(true);
        setResearchError(null);

        log.info("useCompanyResearch: Starting company research", {
          companyTicker: input.companyTicker,
          researchFocus: input.researchFocus,
          userId: user?.uid,
        }, "useCompanyResearch");

        const result = await executeWork<CompanyResearchInput, CompanyResearchOutput>(
          "company_research",
          input,
          input.companyTicker
        );

        log.success("useCompanyResearch: Company research completed", {
          companyTicker: input.companyTicker,
          summaryLength: result.executive_summary.length,
          reportLength: result.research_report.length,
        }, "useCompanyResearch");

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to conduct company research";
        setResearchError(errorMessage);
        log.failure("useCompanyResearch: Company research failed", error, "useCompanyResearch");
        throw error;
      } finally {
        setIsResearching(false);
      }
    },
    [executeWork, user?.uid]
  );

  return {
    conductCompanyResearch,
    isResearching,
    researchError,
  };
}
