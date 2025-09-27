/**
 * Company Research Agent Service
 * 
 * Manages a dedicated AI agent for company research that's always available.
 * Similar to PortfolioManagerAgentService but specifically for company research.
 */

import { agentService } from "@/features/ai/agents/services/agent-service";
import { Agent, CreateAgentRequest } from "@/features/ai/agents/types";
import { aiService, createAIRequest } from "@/lib/services/ai-service";
import { log } from "@/lib/utils/logger";

import { SimpleResearchResponse } from "../types";


export class CompanyResearchAgentService {
  private readonly AGENT_ID = "company-research-agent";
  private readonly AGENT_NAME = "Company Research Agent";
  private readonly AGENT_ROLE = "research_analyst";
  private readonly AGENT_DESCRIPTION = "Dedicated AI agent for comprehensive company research and analysis";

  constructor(private readonly agentServiceInstance = agentService) {}

  async ensureAgent(): Promise<Agent> {
    try {
      // Try to get existing agent
      let agent = await this.agentServiceInstance.getAgent(this.AGENT_ID);
      
      if (!agent) {
        // Create the agent if it doesn't exist
        log.info("Creating Company Research Agent", undefined, "CompanyResearchAgentService");
        
        const createRequest: CreateAgentRequest = {
          name: this.AGENT_NAME,
          description: this.AGENT_DESCRIPTION,
          role: this.AGENT_ROLE,
          // Don't use templateId for now to avoid dependency issues
          model: "gpt-4o-mini",
          temperature: 0.3,
          maxTokens: 3000,
          promptGuidance: `You are the Company Research Agent, specializing in comprehensive company research and investment analysis. Your role is to conduct thorough analysis of companies to provide actionable investment insights.

Research Focus Areas:
1. Company Overview: Business model, operations, market position
2. Financial Analysis: Revenue, profitability, cash flow, key ratios
3. Competitive Analysis: Market share, competitive advantages, threats
4. Growth Prospects: Revenue drivers, market expansion, product pipeline
5. Management Assessment: Leadership quality, corporate governance
6. Risk Assessment: Business, financial, and market risks
7. Investment Thesis: Strengths, opportunities, risks, valuation

Provide comprehensive, well-structured analysis with specific data points and actionable insights. Include both quantitative metrics and qualitative assessment.`,
        };

        agent = await this.agentServiceInstance.createAgent(createRequest, "system");
        log.success("Company Research Agent created successfully", { agentId: agent.id }, "CompanyResearchAgentService");
      } else {
        log.info("Company Research Agent already exists", { agentId: agent.id }, "CompanyResearchAgentService");
      }

      return agent;
    } catch (error) {
      log.error("Failed to ensure Company Research Agent", error, "CompanyResearchAgentService");
      throw error;
    }
  }

  async getAgent(): Promise<Agent | null> {
    try {
      return await this.agentServiceInstance.getAgent(this.AGENT_ID);
    } catch (error) {
      log.error("Failed to get Company Research Agent", error, "CompanyResearchAgentService");
      return null;
    }
  }

  async executeCompanyResearch(
    companyTicker: string,
    researchFocus?: string[],
    additionalContext?: Record<string, unknown>,
    userId?: string
  ): Promise<SimpleResearchResponse> {
    try {
      log.info("Starting executeCompanyResearch", {
        companyTicker,
        researchFocus,
        additionalContext,
        userId
      }, "CompanyResearchAgentService");

      // Ensure the company research agent exists
      const agent = await this.ensureAgent();
      
      log.info("Agent retrieved", {
        agentId: agent.id,
        agentName: agent.name,
        agentModel: agent.model,
        agentModelType: typeof agent.model,
        agentModelName: agent.model?.name,
        agentModelNameType: typeof agent.model?.name
      }, "CompanyResearchAgentService");
      
      // Create simple research prompt
      const prompt = this.createSimpleResearchPrompt(
        companyTicker,
        researchFocus,
        additionalContext
      );

      log.info("Research prompt created", {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + "..."
      }, "CompanyResearchAgentService");

      // Create AI request
      const aiRequest = createAIRequest(
        agent.id,
        prompt,
        {
          ticker: companyTicker,
          focusAreas: researchFocus,
          additionalContext,
        },
        userId || 'system',
        `research_${companyTicker}_${Date.now()}`
      );

      log.info("AI request created", {
        requestId: aiRequest.id,
        agentId: aiRequest.agentId,
        userId: aiRequest.userId,
        sessionId: aiRequest.sessionId,
        contextKeys: Object.keys(aiRequest.context || {})
      }, "CompanyResearchAgentService");

      log.info(
        `Starting AI research for ${companyTicker}`,
        { requestId: aiRequest.id, focusAreas: researchFocus },
        "CompanyResearchAgentService"
      );

      // Convert Agent to AIAgent format
      const aiAgent = {
        id: agent.id,
        name: agent.name,
        description: agent.description || "Company Research Agent",
        role: agent.role,
        model: {
          name: agent.model.name,
          provider: "openai" as const,
          maxTokens: agent.model.maxTokens,
          costPerInputToken: agent.model.costPerInputToken,
          costPerOutputToken: agent.model.costPerOutputToken,
          capabilities: agent.model.capabilities,
          contextWindow: agent.model.contextWindow,
        },
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        systemPrompt: agent.promptGuidance || "",
        version: "1.0.0",
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        isActive: true,
        metadata: {},
      };

      // Debug logging
      log.info("AI Agent configuration", {
        modelName: aiAgent.model.name,
        modelType: typeof aiAgent.model.name,
        agentModel: agent.model,
        agentModelType: typeof agent.model,
        fullAIAgent: JSON.stringify(aiAgent, null, 2)
      }, "CompanyResearchAgentService");

      // Make AI API call
      log.info("Calling AI service", {
        aiAgentModelName: aiAgent.model.name,
        aiAgentModelType: typeof aiAgent.model.name,
        aiRequestId: aiRequest.id,
        operation: "company_research"
      }, "CompanyResearchAgentService");

      const aiResponse = await aiService.generateResponse(
        aiAgent,
        aiRequest,
        "company_research"
      );

      log.info("AI service response received", {
        responseId: aiResponse.id,
        requestId: aiResponse.requestId,
        contentLength: aiResponse.content?.length,
        model: aiResponse.model,
        tokensUsed: aiResponse.tokensUsed,
        cost: aiResponse.cost,
        processingTime: aiResponse.processingTime,
        isCached: aiResponse.isCached
      }, "CompanyResearchAgentService");

      // Check if content contains error
      if (aiResponse.content.includes('"error"') || aiResponse.content.toLowerCase().includes('error:')) {
        log.error("AI service returned error response", { content: aiResponse.content }, "CompanyResearchAgentService");
        throw new Error("AI service returned error response");
      }

      // Check if content is empty or too short
      if (!aiResponse.content || aiResponse.content.trim().length < 50) {
        log.error("AI service returned insufficient content", { contentLength: aiResponse.content?.length }, "CompanyResearchAgentService");
        throw new Error("AI service returned insufficient content");
      }

      // Process the text response
      const { report, summary, recommendation } = this.parseTextResponse(
        aiResponse.content
      );

      log.success(
        `AI research completed for ${companyTicker}`,
        { 
          requestId: aiRequest.id,
          tokensUsed: aiResponse.tokensUsed?.totalTokens,
          cost: aiResponse.cost
        },
        "CompanyResearchAgentService"
      );

      return {
        ticker: companyTicker,
        companyName: this.extractCompanyName(aiResponse.content, companyTicker),
        report,
        summary,
        recommendation,
      };
    } catch (error) {
      log.error("Failed to execute company research", error, "CompanyResearchAgentService");
      throw error;
    }
  }

  private createSimpleResearchPrompt(
    ticker: string,
    focusAreas?: string[],
    additionalContext?: Record<string, unknown>
  ): string {
    const basePrompt = `
Conduct comprehensive investment research on ${ticker}. Provide detailed qualitative analysis covering:

1. Company Overview
   - Business model and operations
   - Market position and competitive advantages
   - Management team and corporate governance

2. Financial Analysis
   - Revenue growth and profitability trends
   - Balance sheet strength and cash flow
   - Financial health assessment

3. Market Analysis
   - Industry dynamics and trends
   - Competitive landscape
   - Market positioning and competitive moats

4. Investment Thesis
   - Key strengths and growth opportunities
   - Risks and challenges
   - Strategic positioning and competitive advantages

5. Investment Recommendation
   - Clear recommendation: BUY, HOLD, or SELL
   - Rationale for the recommendation
   - Key factors driving the decision

Focus on qualitative insights, strategic analysis, and investment rationale. Structure your response with clear sections and conclude with a definitive investment recommendation (BUY/HOLD/SELL) and the reasoning behind it.
`;

    let enhancedPrompt = basePrompt;

    if (focusAreas && focusAreas.length > 0) {
      const focusText = focusAreas.join(', ');
      enhancedPrompt += `\n\nFocus particularly on: ${focusText}`;
    }

    if (additionalContext?.investmentThesis) {
      enhancedPrompt += `\n\nInvestment Context: ${additionalContext.investmentThesis}`;
    }

    if (additionalContext?.specificQuestions && 
        Array.isArray(additionalContext.specificQuestions) && 
        additionalContext.specificQuestions.length > 0) {
      const questions = additionalContext.specificQuestions.join('\n- ');
      enhancedPrompt += `\n\nSpecific Questions to Address:\n- ${questions}`;
    }

    return enhancedPrompt;
  }

  private parseTextResponse(
    content: string
  ): {
    report: string;
    summary: string;
    recommendation: string;
  } {
    // Extract summary (first few sentences or paragraphs)
    const summary = this.extractSummary(content);
    
    // Extract recommendation (look for recommendation keywords)
    const recommendation = this.extractRecommendation(content);

    return {
      report: content,
      summary,
      recommendation,
    };
  }

  private extractSummary(content: string): string {
    // Take first 300 characters or until first major section
    const sentences = content.split('.');
    let summary = '';
    
    for (const sentence of sentences) {
      summary += sentence + '.';
      if (summary.length > 300) break;
    }
    
    return summary || content.substring(0, 300);
  }

  private extractRecommendation(content: string): string {
    const lowerContent = content.toLowerCase();
    
    // Look for recommendation keywords in order of specificity
    if (lowerContent.includes('strong buy')) {
      return 'Strong Buy';
    } else if (lowerContent.includes('strong sell')) {
      return 'Strong Sell';
    } else if (lowerContent.includes('buy')) {
      return 'Buy';
    } else if (lowerContent.includes('sell')) {
      return 'Sell';
    } else if (lowerContent.includes('hold')) {
      return 'Hold';
    }
    
    return 'Hold'; // Default fallback
  }


  private extractCompanyName(content: string, ticker: string): string {
    // Try to extract company name from content
    const nameMatch = content.match(/([A-Z][a-zA-Z\s&]+(?:Inc|Corp|Company|Ltd|LLC))/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
    
    // Fallback to ticker
    return ticker;
  }

  private createResearchPrompt(
    ticker: string,
    focusAreas?: string[],
    additionalContext?: Record<string, unknown>
  ): string {
    // Legacy method - keeping for backward compatibility
    return this.createSimpleResearchPrompt(ticker, focusAreas, additionalContext);
  }
}

export const companyResearchAgentService = new CompanyResearchAgentService();
