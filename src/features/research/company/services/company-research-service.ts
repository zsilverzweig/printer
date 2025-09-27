/**
 * Company Research Service
 * 
 * Handles the business logic for company research including:
 * - Creating research with AI agents
 * - Managing vector embeddings
 * - Context tracking and logging
 * - Research storage and retrieval
 */

import { log } from "@/lib/utils/logger";

import {
  CompanyResearch,
  CreateCompanyResearchRequest,
  UserContext,
  AgentContext,
  MarketContext,
  CompanyMetrics,
} from "../types";

import { companyResearchAgentService } from "./company-research-agent";
import { FirestoreCompanyResearchRepository } from "./firestore-company-research-repository";

export class CompanyResearchService {
  constructor(private readonly repository: CompanyResearchRepository = new FirestoreCompanyResearchRepository()) {}

  async getAllResearch(userId: string): Promise<CompanyResearch[]> {
    try {
      return await this.repository.getAllResearch(userId);
    } catch (error) {
      log.error("Failed to get all research", error, "CompanyResearchService");
      throw error;
    }
  }

  async getResearch(id: string): Promise<CompanyResearch | null> {
    try {
      return await this.repository.getResearch(id);
    } catch (error) {
      log.error("Failed to get research", error, "CompanyResearchService");
      throw error;
    }
  }

  async createResearch(
    request: CreateCompanyResearchRequest,
    userId: string,
    user: Record<string, unknown>
  ): Promise<CompanyResearch> {
    try {
      // Get or create the dedicated company research agent
      const agent = await companyResearchAgentService.ensureAgent();

      // Create initial research record
      const research: CompanyResearch = {
        id: `research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        companyTicker: request.companyTicker.toUpperCase(),
        agentId: agent.id,
        agentName: agent.name,
        
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
          userContext: this.buildUserContext(userId, user),
          agentContext: this.buildAgentContext(agent as unknown as Record<string, unknown>),
          marketContext: await this.buildMarketContext(),
        },
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        
        // Status
        status: 'pending',
      };

      // Save initial research record
      const savedResearch = await this.repository.createResearch(research);

      // Start the research process asynchronously
      this.performResearch(savedResearch, request).catch((error) => {
        log.error("Research failed", error, "CompanyResearchService");
        this.updateResearchStatus(savedResearch.id, 'failed', error.message).catch((updateError) => {
          log.error("Failed to update research status to failed", updateError, "CompanyResearchService");
        });
      });

      return savedResearch;
    } catch (error) {
      log.error("Failed to create research", error, "CompanyResearchService");
      throw error;
    }
  }

  private async performResearch(
    research: CompanyResearch,
    request: CreateCompanyResearchRequest
  ): Promise<void> {
    try {
      log.info(`Starting research for ${research.companyTicker}`, { 
        researchId: research.id,
        request: request
      }, "CompanyResearchService");
      
      // Update status to in_progress
      await this.updateResearchStatus(research.id, 'in_progress');

      log.info("Calling company research agent service", {
        researchId: research.id,
        companyTicker: research.companyTicker,
        researchFocus: request.researchFocus,
        additionalContext: request.additionalContext,
        userId: research.userId
      }, "CompanyResearchService");

      // Perform the research using the dedicated company research agent
      const researchResponse = await companyResearchAgentService.executeCompanyResearch(
        research.companyTicker,
        request.researchFocus,
        request.additionalContext,
        research.userId
      );

      log.info("Research response received from agent", {
        researchId: research.id,
        responseTicker: researchResponse.ticker,
        responseCompanyName: researchResponse.companyName,
        reportLength: researchResponse.report?.length,
        summaryLength: researchResponse.summary?.length,
        recommendation: researchResponse.recommendation
      }, "CompanyResearchService");

      // Generate embeddings for vector search
      const embeddings = await this.generateEmbeddings(researchResponse.report, researchResponse.summary);

      // Update the research with results
      const updatedResearch: Partial<CompanyResearch> = {
        researchReport: researchResponse.report,
        executiveSummary: researchResponse.summary,
        embeddings,
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      };

      await this.repository.updateResearch(research.id, updatedResearch);

      log.success(
        `Research completed for ${research.companyTicker}`,
        { researchId: research.id },
        "CompanyResearchService"
      );
    } catch (error) {
      log.error("Research execution failed", error, "CompanyResearchService");
      throw error;
    }
  }

  private createResearchPrompt(
    ticker: string,
    focusAreas?: string[],
    additionalContext?: Record<string, unknown>
  ): string {
    const basePrompt = `
Conduct comprehensive research on ${ticker}. Provide detailed analysis covering:

1. Company Overview
   - Business model and operations
   - Market position and competitive advantages
   - Management team and corporate governance

2. Financial Analysis
   - Revenue growth and profitability trends
   - Balance sheet strength and cash flow
   - Key financial ratios and metrics

3. Market Analysis
   - Industry dynamics and trends
   - Competitive landscape
   - Market share and positioning

4. Investment Thesis
   - Key strengths and opportunities
   - Risks and challenges
   - Valuation considerations

Please provide specific data points, metrics, and actionable insights.
`;

    if (focusAreas && focusAreas.length > 0) {
      const focusText = focusAreas.join(', ');
      return basePrompt + `\n\nFocus particularly on: ${focusText}`;
    }

    if (additionalContext?.investmentThesis) {
      return basePrompt + `\n\nInvestment Context: ${additionalContext.investmentThesis}`;
    }

    if (additionalContext?.specificQuestions && 
        Array.isArray(additionalContext.specificQuestions) && 
        additionalContext.specificQuestions.length > 0) {
      const questions = additionalContext.specificQuestions.join('\n- ');
      return basePrompt + `\n\nSpecific Questions to Address:\n- ${questions}`;
    }

    return basePrompt;
  }


  private parseResearchResult(result: Record<string, unknown>): {
    report: string;
    summary: string;
    metrics: CompanyMetrics;
  } {
    // Legacy method for backward compatibility
    const report = String(result.output || result.report || result.content || "");
    const summary = this.extractSummary(report);
    const metrics = this.extractMetrics(report);
    return { report, summary, metrics };
  }

  private extractSummary(report: string): string {
    // Simple extraction - take first 500 characters or until first major section
    const sentences = report.split('.');
    let summary = '';
    
    for (const sentence of sentences) {
      summary += sentence + '.';
      if (summary.length > 500) break;
    }
    
    return summary || report.substring(0, 500);
  }

  private extractMetrics(report: string): CompanyMetrics {
    // Extract common financial metrics from the report
    // This is a simplified version - in production you'd want more sophisticated parsing
    const metrics: CompanyMetrics = {};
    
    // Look for common patterns like "Market Cap: $X" or "P/E Ratio: X"
    const marketCapMatch = report.match(/market cap[:\s]*\$?([\d,.]+)/i);
    if (marketCapMatch) {
      metrics.marketCap = parseFloat(marketCapMatch[1].replace(/,/g, ''));
    }
    
    const peRatioMatch = report.match(/p\/e ratio[:\s]*([\d.]+)/i);
    if (peRatioMatch) {
      metrics.peRatio = parseFloat(peRatioMatch[1]);
    }
    
    // Add more metric extraction logic as needed
    
    return metrics;
  }

  private async generateEmbeddings(
    report: string,
    summary: string
  ): Promise<{ report: number[]; summary: number[]; metrics: number[] }> {
    // TODO: Implement vector embedding generation
    // This would typically use a service like OpenAI Embeddings or similar
    // For now, return empty arrays (report and summary parameters will be used later)
    log.info('Generating embeddings', { reportLength: report.length, summaryLength: summary.length }, 'CompanyResearchService');
    return {
      report: [],
      summary: [],
      metrics: [],
    };
  }

  private buildUserContext(userId: string, user: Record<string, unknown>): UserContext {
    return {
      userId,
      userRole: String(user.role || 'user'),
      investmentProfile: {
        riskTolerance: 'moderate', // Default - could be from user profile
        investmentHorizon: 'long', // Default
        sectors: [], // Could be from user preferences
      },
    };
  }

  private buildAgentContext(agent: Record<string, unknown>): AgentContext {
    return {
      agentId: String(agent.id),
      agentName: String(agent.name),
      agentRole: String(agent.role),
      agentCapabilities: Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : [],
      model: String(agent.model),
      temperature: Number(agent.temperature),
      maxTokens: Number(agent.maxTokens),
      promptGuidance: String(agent.promptGuidance || ''),
    };
  }

  private async buildMarketContext(): Promise<MarketContext> {
    // TODO: Implement market context gathering
    // This could pull from external APIs for market conditions
    return {
      marketConditions: 'sideways', // Default
      sectorTrends: [],
      economicIndicators: {},
      timestamp: new Date(),
    };
  }

  async deleteResearch(id: string): Promise<void> {
    try {
      await this.repository.deleteResearch(id);
    } catch (error) {
      log.error("Failed to delete research", error, "CompanyResearchService");
      throw error;
    }
  }

  async searchResearch(query: string, userId: string): Promise<CompanyResearch[]> {
    try {
      return await this.repository.searchResearch(query, userId);
    } catch (error) {
      log.error("Failed to search research", error, "CompanyResearchService");
      throw error;
    }
  }

  private async updateResearchStatus(
    researchId: string,
    status: CompanyResearch['status'],
    errorMessage?: string
  ): Promise<void> {
    try {
      const updates: Partial<CompanyResearch> = {
        status,
        updatedAt: new Date(),
      };
      
      if (errorMessage) {
        updates.errorMessage = errorMessage;
      }
      
      if (status === 'completed') {
        updates.completedAt = new Date();
      }
      
      await this.repository.updateResearch(researchId, updates);
    } catch (error) {
      log.error("Failed to update research status", error, "CompanyResearchService");
    }
  }
}

// Repository interface and implementation
export interface CompanyResearchRepository {
  createResearch(research: CompanyResearch): Promise<CompanyResearch>;
  getResearch(id: string): Promise<CompanyResearch | null>;
  getAllResearch(userId: string): Promise<CompanyResearch[]>;
  updateResearch(id: string, updates: Partial<CompanyResearch>): Promise<CompanyResearch>;
  deleteResearch(id: string): Promise<void>;
  searchResearch(query: string, userId: string): Promise<CompanyResearch[]>;
}

// Repository interface is defined in types/index.ts
// Firestore implementation is in firestore-company-research-repository.ts

export const companyResearchService = new CompanyResearchService();
