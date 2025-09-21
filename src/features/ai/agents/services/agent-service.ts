// Agent service for managing AI agents, portfolios, and workflow execution

import {
  AI_MODELS,
  aiService,
  createAIRequest,
} from "@/lib/services/ai-service";
import { AIAgent } from "@/lib/types/ai";
import { log } from "@/lib/utils/logger";

import {
  Agent,
  AgentTemplate,
  AgentVersion,
  AgentWork,
  AssignedAgent,
  CreateAgentRequest,
  CreatePortfolioRequest,
  DEFAULT_WORKFLOW,
  Portfolio,
  UpdateAgentRequest,
  UpdatePortfolioRequest,
} from "../types";

// Mock data storage (replace with Firebase in production)
class AgentStorage {
  private agents = new Map<string, Agent>();
  private agentVersions = new Map<string, AgentVersion[]>();
  private templates = new Map<string, AgentTemplate>();
  private portfolios = new Map<string, Portfolio>();
  private agentWork = new Map<string, AgentWork>();

  // Agent operations
  async createAgent(agent: Agent): Promise<Agent> {
    this.agents.set(agent.id, agent);
    this.agentVersions.set(agent.id, []);
    return agent;
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.agents.get(id) || null;
  }

  async getAllAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
    const existing = this.agents.get(id);
    if (!existing) throw new Error(`Agent ${id} not found`);

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.agents.set(id, updated);
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    this.agents.delete(id);
    this.agentVersions.delete(id);
  }

  // Version operations
  async createAgentVersion(version: AgentVersion): Promise<AgentVersion> {
    const versions = this.agentVersions.get(version.agentId) || [];
    versions.push(version);
    this.agentVersions.set(version.agentId, versions);
    return version;
  }

  async getAgentVersions(agentId: string): Promise<AgentVersion[]> {
    return this.agentVersions.get(agentId) || [];
  }

  // Template operations
  async createTemplate(template: AgentTemplate): Promise<AgentTemplate> {
    this.templates.set(template.id, template);
    return template;
  }

  async getTemplate(id: string): Promise<AgentTemplate | null> {
    return this.templates.get(id) || null;
  }

  async getAllTemplates(): Promise<AgentTemplate[]> {
    return Array.from(this.templates.values());
  }

  // Portfolio operations
  async createPortfolio(portfolio: Portfolio): Promise<Portfolio> {
    this.portfolios.set(portfolio.id, portfolio);
    return portfolio;
  }

  async getPortfolio(id: string): Promise<Portfolio | null> {
    return this.portfolios.get(id) || null;
  }

  async getAllPortfolios(userId: string): Promise<Portfolio[]> {
    return Array.from(this.portfolios.values()).filter(
      (p) => p.userId === userId
    );
  }

  async updatePortfolio(
    id: string,
    updates: Partial<Portfolio>
  ): Promise<Portfolio> {
    const existing = this.portfolios.get(id);
    if (!existing) throw new Error(`Portfolio ${id} not found`);

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.portfolios.set(id, updated);
    return updated;
  }

  async deletePortfolio(id: string): Promise<void> {
    this.portfolios.delete(id);
  }

  // Work operations
  async createWork(work: AgentWork): Promise<AgentWork> {
    this.agentWork.set(work.id, work);
    return work;
  }

  async getWork(id: string): Promise<AgentWork | null> {
    return this.agentWork.get(id) || null;
  }

  async updateWork(
    id: string,
    updates: Partial<AgentWork>
  ): Promise<AgentWork> {
    const existing = this.agentWork.get(id);
    if (!existing) throw new Error(`Work ${id} not found`);

    const updated = { ...existing, ...updates };
    this.agentWork.set(id, updated);
    return updated;
  }

  async getWorkHistory(portfolioId: string): Promise<AgentWork[]> {
    return Array.from(this.agentWork.values()).filter(
      (w) => w.portfolioId === portfolioId
    );
  }
}

const storage = new AgentStorage();

export class AgentService {
  private initialized = false;

  constructor() {
    this.initializeDefaultTemplates();
  }

  private async initializeDefaultTemplates(): Promise<void> {
    if (this.initialized) return;

    const defaultTemplates: AgentTemplate[] = [
      {
        id: "business-fundamentals",
        name: "Business Fundamentals Agent",
        description:
          "Analyzes revenue, margins, growth, and core business metrics",
        role: "business_fundamentals",
        category: "cru",
        defaultPromptGuidance: `You are a Business Fundamentals Analyst. Your role is to analyze the core business metrics and fundamentals of companies.

Focus on:
- Revenue growth and quality
- Profit margins and trends
- Market position and competitive advantages
- Business model sustainability
- Key performance indicators

Provide structured analysis with specific metrics and clear recommendations.`,
        defaultWorkflow: DEFAULT_WORKFLOW,
        defaultModel: "gpt-4o-mini",
        defaultTemperature: 0.3,
        defaultMaxTokens: 2000,
        isBuiltIn: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "risk-assessor",
        name: "Risk Assessment Agent",
        description: "Identifies and quantifies investment risks",
        role: "risk_assessor",
        category: "cru",
        defaultPromptGuidance: `You are a Risk Assessment Specialist. Your role is to identify, analyze, and quantify investment risks.

Focus on:
- Market risks and volatility
- Company-specific risks
- Regulatory and compliance risks
- Financial risks and debt levels
- Operational risks
- Black swan event potential

Provide risk ratings, probability assessments, and mitigation strategies.`,
        defaultWorkflow: DEFAULT_WORKFLOW,
        defaultModel: "gpt-4o-mini",
        defaultTemperature: 0.2,
        defaultMaxTokens: 2000,
        isBuiltIn: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "narrative-analyst",
        name: "Narrative Analyst",
        description: "Analyzes market sentiment and investment narratives",
        role: "narrative_analyst",
        category: "cru",
        defaultPromptGuidance: `You are a Narrative Analyst. Your role is to analyze market sentiment, investor narratives, and story-driven factors.

Focus on:
- Market sentiment and momentum
- Investor expectations and positioning
- Media coverage and public perception
- Sector trends and themes
- Catalysts and narrative drivers
- Contrarian opportunities

Assess narrative strength, sustainability, and potential for change.`,
        defaultWorkflow: DEFAULT_WORKFLOW,
        defaultModel: "gpt-4o-mini",
        defaultTemperature: 0.4,
        defaultMaxTokens: 2000,
        isBuiltIn: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "counterpoint-agent",
        name: "Counterpoint Agent",
        description:
          "Provides adversarial testing and challenges investment theses",
        role: "counterpoint_agent",
        category: "cru",
        defaultPromptGuidance: `You are a Counterpoint Agent. Your role is to challenge investment theses and provide adversarial analysis.

Focus on:
- Identifying weaknesses in the thesis
- Alternative explanations and scenarios
- Potential negative catalysts
- Overlooked risks and concerns
- Market inefficiencies and mispricings
- Contrarian viewpoints

Be critical but constructive. Challenge assumptions and provide balanced perspectives.`,
        defaultWorkflow: DEFAULT_WORKFLOW,
        defaultModel: "gpt-4o-mini",
        defaultTemperature: 0.5,
        defaultMaxTokens: 2000,
        isBuiltIn: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const template of defaultTemplates) {
      await storage.createTemplate(template);
    }

    this.initialized = true;
    log.info("Default agent templates initialized", undefined, "AgentService");
  }

  // Agent Management
  async createAgent(
    request: CreateAgentRequest,
    createdBy: string
  ): Promise<Agent> {
    const template = request.templateId
      ? await storage.getTemplate(request.templateId)
      : null;

    const agent: Agent = {
      id: this.generateId(),
      name: request.name,
      description: request.description,
      role: request.role,
      promptGuidance:
        request.promptGuidance || template?.defaultPromptGuidance || "",
      workflow:
        request.workflow || template?.defaultWorkflow || DEFAULT_WORKFLOW,
      model:
        AI_MODELS[request.model as keyof typeof AI_MODELS] ||
        AI_MODELS["gpt-4o-mini"],
      temperature: request.temperature ?? template?.defaultTemperature ?? 0.3,
      maxTokens: request.maxTokens ?? template?.defaultMaxTokens ?? 2000,
      version: "1.0.0",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy,
    };

    const createdAgent = await storage.createAgent(agent);

    // Create initial version
    await this.createAgentVersion(
      createdAgent.id,
      createdBy,
      "Initial version"
    );

    log.success(
      `Agent created: ${createdAgent.name}`,
      undefined,
      "AgentService"
    );
    return createdAgent;
  }

  async getAgent(id: string): Promise<Agent | null> {
    return storage.getAgent(id);
  }

  async getAllAgents(): Promise<Agent[]> {
    return storage.getAllAgents();
  }

  async updateAgent(
    id: string,
    request: UpdateAgentRequest,
    updatedBy: string
  ): Promise<Agent> {
    const existing = await storage.getAgent(id);
    if (!existing) throw new Error(`Agent ${id} not found`);

    // Check if versioning is needed
    const needsVersioning =
      (request.promptGuidance !== undefined &&
        request.promptGuidance !== existing.promptGuidance) ||
      (request.workflow !== undefined &&
        JSON.stringify(request.workflow) !== JSON.stringify(existing.workflow));

    let updates = request;
    if (needsVersioning) {
      // Create new version before updating
      await this.createAgentVersion(
        id,
        updatedBy,
        request.changeReason || "Configuration updated"
      );

      // Increment version
      const versionParts = existing.version.split(".");
      const newVersion = `${versionParts[0]}.${
        parseInt(versionParts[1]) + 1
      }.0`;
      updates = { ...request, version: newVersion };
    }

    const updated = await storage.updateAgent(id, updates);
    log.success(`Agent updated: ${updated.name}`, undefined, "AgentService");
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    await storage.deleteAgent(id);
    log.info(`Agent deleted: ${id}`, undefined, "AgentService");
  }

  // Version Management
  async createAgentVersion(
    agentId: string,
    createdBy: string,
    changeReason?: string
  ): Promise<AgentVersion> {
    const agent = await storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const version: AgentVersion = {
      id: this.generateId(),
      agentId,
      version: agent.version,
      promptGuidance: agent.promptGuidance,
      workflow: agent.workflow,
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      createdAt: new Date(),
      createdBy,
      changeReason,
      isActive: false,
    };

    return storage.createAgentVersion(version);
  }

  async getAgentVersions(agentId: string): Promise<AgentVersion[]> {
    return storage.getAgentVersions(agentId);
  }

  async revertToVersion(
    agentId: string,
    versionId: string,
    revertedBy: string
  ): Promise<Agent> {
    const versions = await storage.getAgentVersions(agentId);
    const version = versions.find((v) => v.id === versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);

    const agent = await storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Create new version before reverting
    await this.createAgentVersion(
      agentId,
      revertedBy,
      `Reverted to version ${version.version}`
    );

    // Update agent with version data
    const updated = await storage.updateAgent(agentId, {
      promptGuidance: version.promptGuidance,
      workflow: version.workflow,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      version: `${version.version}.revert`,
    });

    log.success(
      `Agent reverted to version ${version.version}`,
      undefined,
      "AgentService"
    );
    return updated;
  }

  // Template Management
  async getTemplates(): Promise<AgentTemplate[]> {
    await this.initializeDefaultTemplates();
    return storage.getAllTemplates();
  }

  async getTemplate(id: string): Promise<AgentTemplate | null> {
    return storage.getTemplate(id);
  }

  // Portfolio Management
  async createPortfolio(
    request: CreatePortfolioRequest,
    userId: string
  ): Promise<Portfolio> {
    const portfolio: Portfolio = {
      id: this.generateId(),
      name: request.name,
      description: request.description,
      thesis: request.thesis,
      assignedAgents: [],
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    const createdPortfolio = await storage.createPortfolio(portfolio);

    // Assign agents if provided
    if (request.assignedAgentIds) {
      for (const agentId of request.assignedAgentIds) {
        await this.assignAgent(createdPortfolio.id, agentId, userId);
      }
    }

    log.success(
      `Portfolio created: ${createdPortfolio.name}`,
      undefined,
      "AgentService"
    );
    return createdPortfolio;
  }

  async getPortfolio(id: string): Promise<Portfolio | null> {
    return storage.getPortfolio(id);
  }

  async getAllPortfolios(userId: string): Promise<Portfolio[]> {
    return storage.getAllPortfolios(userId);
  }

  async updatePortfolio(
    id: string,
    request: UpdatePortfolioRequest
  ): Promise<Portfolio> {
    const existing = await storage.getPortfolio(id);
    if (!existing) throw new Error(`Portfolio ${id} not found`);

    const updated = await storage.updatePortfolio(id, request);

    // Handle agent assignments
    if (request.assignedAgentIds) {
      // Get all agents to populate the assignedAgents array
      const allAgents = await this.getAllAgents();
      const assignedAgents = request.assignedAgentIds.map((agentId) => {
        const agent = allAgents.find((a) => a.id === agentId);
        if (!agent) throw new Error(`Agent ${agentId} not found`);

        return {
          agentId,
          agent,
          assignedAt: new Date(),
          assignedBy: existing.userId,
          isActive: true,
          workCount: 0,
        };
      });

      updated.assignedAgents = assignedAgents;
    }

    log.success(
      `Portfolio updated: ${updated.name}`,
      undefined,
      "AgentService"
    );
    return updated;
  }

  async deletePortfolio(id: string): Promise<void> {
    await storage.deletePortfolio(id);
    log.info(`Portfolio deleted: ${id}`, undefined, "AgentService");
  }

  async assignAgent(
    portfolioId: string,
    agentId: string,
    assignedBy: string
  ): Promise<void> {
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`);

    const agent = await storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Check if already assigned
    const existingAssignment = portfolio.assignedAgents.find(
      (a) => a.agentId === agentId
    );
    if (existingAssignment) {
      throw new Error(
        `Agent ${agentId} is already assigned to portfolio ${portfolioId}`
      );
    }

    const assignedAgent: AssignedAgent = {
      agentId,
      agent,
      assignedAt: new Date(),
      assignedBy,
      isActive: true,
      workCount: 0,
    };

    portfolio.assignedAgents.push(assignedAgent);
    await storage.updatePortfolio(portfolioId, {
      assignedAgents: portfolio.assignedAgents,
    });

    log.success(
      `Agent ${agent.name} assigned to portfolio ${portfolio.name}`,
      undefined,
      "AgentService"
    );
  }

  async unassignAgent(portfolioId: string, agentId: string): Promise<void> {
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`);

    portfolio.assignedAgents = portfolio.assignedAgents.filter(
      (a) => a.agentId !== agentId
    );
    await storage.updatePortfolio(portfolioId, {
      assignedAgents: portfolio.assignedAgents,
    });

    log.info(
      `Agent ${agentId} unassigned from portfolio ${portfolioId}`,
      undefined,
      "AgentService"
    );
  }

  // Work Execution
  async executeWork(
    portfolioId: string,
    agentId: string,
    userId: string
  ): Promise<AgentWork> {
    const portfolio = await storage.getPortfolio(portfolioId);
    if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`);

    const assignedAgent = portfolio.assignedAgents.find(
      (a) => a.agentId === agentId
    );
    if (!assignedAgent)
      throw new Error(
        `Agent ${agentId} is not assigned to portfolio ${portfolioId}`
      );

    const agent = assignedAgent.agent;

    const work: AgentWork = {
      id: this.generateId(),
      portfolioId,
      agentId,
      agent,
      thesis: portfolio.thesis,
      status: "pending",
      startedAt: new Date(),
    };

    const createdWork = await storage.createWork(work);

    // Execute workflow asynchronously
    this.executeWorkflow(createdWork).catch((error) => {
      log.failure(
        `Workflow execution failed for work ${createdWork.id}`,
        error,
        "AgentService"
      );
    });

    return createdWork;
  }

  private async executeWorkflow(work: AgentWork): Promise<void> {
    try {
      // Update status to running
      await storage.updateWork(work.id, { status: "running" });

      // Convert agent to AIAgent format
      const aiAgent: AIAgent = {
        id: work.agent.id,
        name: work.agent.name,
        description: work.agent.description,
        role: work.agent.role,
        model: work.agent.model,
        systemPrompt: work.agent.promptGuidance,
        temperature: work.agent.temperature,
        maxTokens: work.agent.maxTokens,
        version: work.agent.version,
        createdAt: work.agent.createdAt,
        updatedAt: work.agent.updatedAt,
        isActive: work.agent.isActive,
      };

      // Create AI request
      const request = createAIRequest(
        work.agent.id,
        `Investment Thesis Analysis:\n\n${work.thesis}`,
        { portfolioId: work.portfolioId, workId: work.id },
        work.portfolioId // Using portfolioId as userId for now
      );

      // Execute AI request
      const response = await aiService.generateResponse(
        aiAgent,
        request,
        "thesis_generation"
      );

      // Update work with results
      await storage.updateWork(work.id, {
        status: "completed",
        request,
        response,
        completedAt: new Date(),
      });

      // Update agent work count
      const portfolio = await storage.getPortfolio(work.portfolioId);
      if (portfolio) {
        const assignedAgent = portfolio.assignedAgents.find(
          (a) => a.agentId === work.agentId
        );
        if (assignedAgent) {
          assignedAgent.workCount += 1;
          assignedAgent.lastWorkedAt = new Date();
          await storage.updatePortfolio(work.portfolioId, {
            assignedAgents: portfolio.assignedAgents,
          });
        }
      }

      log.success(`Work completed: ${work.id}`, undefined, "AgentService");
    } catch (error) {
      await storage.updateWork(work.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      });

      log.failure(`Work failed: ${work.id}`, error, "AgentService");
    }
  }

  async getWork(id: string): Promise<AgentWork | null> {
    return storage.getWork(id);
  }

  async getWorkHistory(portfolioId: string): Promise<AgentWork[]> {
    return storage.getWorkHistory(portfolioId);
  }

  async cancelWork(id: string): Promise<void> {
    const work = await storage.getWork(id);
    if (!work) throw new Error(`Work ${id} not found`);

    if (work.status === "running" || work.status === "pending") {
      await storage.updateWork(id, {
        status: "cancelled",
        completedAt: new Date(),
      });
      log.info(`Work cancelled: ${id}`, undefined, "AgentService");
    }
  }

  private generateId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global service instance
export const agentService = new AgentService();
export default agentService;
