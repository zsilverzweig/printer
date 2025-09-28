"use client";

import { useCallback, useMemo } from "react";

import { FirestoreCompanyResearchRepository } from "../services/firestore-company-research-repository";
import {
  CompanyResearch,
  CreateCompanyResearchRequest,
  UserContext,
  AgentContext,
  MarketContext,
} from "../types";

import { useCompanyResearchAgent } from "./use-company-research-agent";

/**
 * Hook that provides the company research service functionality
 * using the new agent architecture
 */
export function useCompanyResearchService() {
  const { executeCompanyResearch, isResearching, researchError } = useCompanyResearchAgent();
  const repository = useMemo(() => new FirestoreCompanyResearchRepository(), []);

  const buildUserContext = useCallback((userId: string, user: Record<string, unknown>): UserContext => {
    return {
      userId,
      displayName: String(user.displayName || 'Unknown User'),
      email: String(user.email || ''),
      role: String(user.role || 'user'),
      preferences: user.preferences as Record<string, unknown> || {},
      createdAt: user.createdAt ? new Date(user.createdAt as string) : new Date(),
    };
  }, []);

  const buildAgentContext = useCallback((): AgentContext => {
    return {
      agentId: "company-research-agent",
      agentName: "Company Research Agent",
      agentRole: "research_analyst",
      agentCapabilities: ["company_research", "financial_analysis", "risk_assessment"],
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 3000,
      promptGuidance: "Specialized in comprehensive company research and investment analysis",
    };
  }, []);

  const buildMarketContext = useCallback(async (): Promise<MarketContext> => {
    // Mock market context - in real implementation, this would fetch current market data
    return {
      marketConditions: "normal",
      sectorPerformance: "mixed",
      economicIndicators: {
        gdp: 2.5,
        inflation: 3.2,
        unemployment: 4.1,
      },
      marketSentiment: "neutral",
      timestamp: new Date(),
    };
  }, []);

  const getAllResearch = useCallback(async (userId: string): Promise<CompanyResearch[]> => {
    return await repository.getAllResearch(userId);
  }, [repository]);

  const getResearch = useCallback(async (id: string): Promise<CompanyResearch | null> => {
    return await repository.getResearch(id);
  }, [repository]);

  const createResearch = useCallback(
    async (
      request: CreateCompanyResearchRequest,
      userId: string,
      user: Record<string, unknown>
    ): Promise<CompanyResearch> => {
      // Create initial research record
      const research: CompanyResearch = {
        id: `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        companyTicker: request.companyTicker.toUpperCase(),
        agentId: "company-research-agent",
        agentName: "Company Research Agent",
        
        // Initialize empty content
        researchReport: "",
        executiveSummary: "",
        keyMetrics: {},
        
        // Initialize empty embeddings
        embeddings: {
          report: [],
          summary: [],
          metrics: [],
        },
        
        // Build context
        researchContext: {
          userContext: buildUserContext(userId, user),
          agentContext: buildAgentContext(),
          marketContext: await buildMarketContext(),
        },
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        
        // Status
        status: 'pending',
      };

      // Save initial research record
      const savedResearch = await repository.createResearch(research);

      // Start the research process asynchronously
      performResearch(savedResearch, request).catch((error) => {
        console.error("Research process failed:", error);
        // Update research status to failed
        repository.updateResearch(savedResearch.id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        }).catch(console.error);
      });

      return savedResearch;
    },
    [repository, buildUserContext, buildAgentContext, buildMarketContext]
  );

  const performResearch = useCallback(
    async (research: CompanyResearch, request: CreateCompanyResearchRequest) => {
      try {
        // Update status to in_progress
        await repository.updateResearch(research.id, {
          status: 'in_progress',
          updatedAt: new Date(),
        });

        // Execute research using the new agent system
        const response = await executeCompanyResearch(
          research.companyTicker,
          undefined, // researchFocus no longer used
          request.additionalContext,
          research.userId
        );

        // Update research with results
        const updatedResearch = {
          ...research,
          researchReport: response.content,
          executiveSummary: response.summary || '',
          keyMetrics: {}, // No longer provided
          recommendation: '', // No longer provided
          status: 'completed' as const,
          completedAt: new Date(),
          updatedAt: new Date(),
        };

        await repository.updateResearch(research.id, updatedResearch);
      } catch (error) {
        console.error("Research execution failed:", error);
        throw error;
      }
    },
    [repository, executeCompanyResearch]
  );

  return useMemo(
    () => ({
      getAllResearch,
      getResearch,
      createResearch,
      isResearching,
      researchError,
    }),
    [getAllResearch, getResearch, createResearch, isResearching, researchError]
  );
}
