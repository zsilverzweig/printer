import { AI_MODELS } from "@/lib/services/ai-service"
import { log } from "@/lib/utils/logger"

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
} from "../types"

import {
  AgentRepository,
  FirestoreAgentRepository,
} from "./firestore/agent-repository"
import { AgentTemplateInitializer } from "./agent-service/template-initializer"
import { PortfolioManagerAgentService } from "./agent-service/portfolio-manager-agent"
import { PortfolioPlanService } from "./agent-service/portfolio-plan-service"
import { AgentWorkExecutor } from "./workflow/agent-work-executor"

export class AgentService {
  constructor(
    private readonly repository: AgentRepository = new FirestoreAgentRepository(),
    private readonly workExecutor: AgentWorkExecutor = new AgentWorkExecutor(
      repository
    ),
    private readonly templateInitializer: AgentTemplateInitializer =
      new AgentTemplateInitializer(repository),
    private readonly portfolioManagerAgent: PortfolioManagerAgentService =
      new PortfolioManagerAgentService(repository),
    private readonly portfolioPlanService: PortfolioPlanService =
      new PortfolioPlanService(portfolioManagerAgent)
  ) {
    void this.templateInitializer.ensureDefaultTemplates()
    void this.portfolioManagerAgent.ensureAgent()
  }

  private resolveModel(
    requested: string | Agent["model"] | undefined,
    fallback: Agent["model"]
  ): Agent["model"] {
    if (!requested) {
      return fallback
    }

    if (typeof requested === "string") {
      return (
        AI_MODELS[requested as keyof typeof AI_MODELS] ?? fallback
      ) as Agent["model"]
    }

    return requested
  }

  // Agent Management
  async createAgent(
    request: CreateAgentRequest,
    createdBy: string
  ): Promise<Agent> {
    const template = request.templateId
      ? await this.repository.getTemplate(request.templateId)
      : null

    const defaultModelKey = template?.defaultModel ?? "gpt-4o-mini"
    const model =
      (request.model &&
        AI_MODELS[request.model as keyof typeof AI_MODELS]) ||
      AI_MODELS[defaultModelKey as keyof typeof AI_MODELS] ||
      AI_MODELS["gpt-4o-mini"]

    const agent: Agent = {
      id: this.generateId(),
      name: request.name,
      description: request.description,
      role: request.role,
      promptGuidance:
        request.promptGuidance || template?.defaultPromptGuidance || "",
      workflow:
        request.workflow || template?.defaultWorkflow || DEFAULT_WORKFLOW,
      model,
      temperature: request.temperature ?? template?.defaultTemperature ?? 0.3,
      maxTokens: request.maxTokens ?? template?.defaultMaxTokens ?? 2000,
      version: "1.0.0",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy,
    }

    const createdAgent = await this.repository.createAgent(agent)

    await this.createAgentVersion(
      createdAgent.id,
      createdBy,
      "Initial version"
    )

    log.success(
      `Agent created: ${createdAgent.name}`,
      undefined,
      "AgentService"
    )
    return createdAgent
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.repository.getAgent(id)
  }

  async getAllAgents(): Promise<Agent[]> {
    return this.repository.getAllAgents()
  }

  async updateAgent(
    id: string,
    request: UpdateAgentRequest,
    updatedBy: string
  ): Promise<Agent> {
    const existing = await this.repository.getAgent(id)
    if (!existing) throw new Error(`Agent ${id} not found`)

    const needsVersioning =
      (request.promptGuidance !== undefined &&
        request.promptGuidance !== existing.promptGuidance) ||
      (request.workflow !== undefined &&
        JSON.stringify(request.workflow) !== JSON.stringify(existing.workflow))

    let versionToApply = existing.version
    if (needsVersioning) {
      await this.createAgentVersion(
        id,
        updatedBy,
        request.changeReason || "Configuration updated"
      )

      const versionParts = existing.version.split(".")
      versionToApply = `${versionParts[0]}.${
        parseInt(versionParts[1]) + 1
      }.0`
    }

    const { changeReason: _ignored, model, ...rest } = request
    const updates: Partial<Agent> = { ...rest }

    if (model !== undefined) {
      updates.model = this.resolveModel(model, existing.model)
    }

    if (needsVersioning) {
      updates.version = versionToApply
    }

    const updated = await this.repository.updateAgent(id, updates)
    log.success(`Agent updated: ${updated.name}`, undefined, "AgentService")
    return updated
  }

  async deleteAgent(id: string): Promise<void> {
    await this.repository.deleteAgent(id)
    log.info(`Agent deleted: ${id}`, undefined, "AgentService")
  }

  // Version Management
  async createAgentVersion(
    agentId: string,
    createdBy: string,
    changeReason?: string
  ): Promise<AgentVersion> {
    const agent = await this.repository.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

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
    }

    return this.repository.createAgentVersion(version)
  }

  async getAgentVersions(agentId: string): Promise<AgentVersion[]> {
    return this.repository.getAgentVersions(agentId)
  }

  async revertToVersion(
    agentId: string,
    versionId: string,
    revertedBy: string
  ): Promise<Agent> {
    const versions = await this.repository.getAgentVersions(agentId)
    const version = versions.find((v) => v.id === versionId)
    if (!version) throw new Error(`Version ${versionId} not found`)

    const agent = await this.repository.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    await this.createAgentVersion(
      agentId,
      revertedBy,
      `Reverted to version ${version.version}`
    )

    const updated = await this.repository.updateAgent(agentId, {
      promptGuidance: version.promptGuidance,
      workflow: version.workflow,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      version: `${version.version}.revert`,
    })

    log.success(
      `Agent reverted to version ${version.version}`,
      undefined,
      "AgentService"
    )
    return updated
  }

  // Template Management
  async getTemplates(): Promise<AgentTemplate[]> {
    await this.templateInitializer.ensureDefaultTemplates()
    return this.repository.getAllTemplates()
  }

  async getTemplate(id: string): Promise<AgentTemplate | null> {
    return this.repository.getTemplate(id)
  }

  // Portfolio Management
  async createPortfolio(
    request: CreatePortfolioRequest,
    userId: string
  ): Promise<Portfolio> {
    const portfolioManager = await this.portfolioManagerAgent.ensureAgent()
    const portfolio: Portfolio = {
      id: this.generateId(),
      name: request.name,
      description: request.description,
      thesis: request.thesis,
      assignedAgents: [],
      positions: request.positions ?? [],
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: request.isActive ?? true,
      metadata: request.metadata,
    }

    const createdPortfolio = await this.repository.createPortfolio(portfolio)

    await this.assignAgent(createdPortfolio.id, portfolioManager.id, userId)

    if (request.assignedAgentIds) {
      for (const agentId of request.assignedAgentIds) {
        if (agentId === portfolioManager.id) continue
        await this.assignAgent(createdPortfolio.id, agentId, userId)
      }
    }

    const finalPortfolio =
      (await this.repository.getPortfolio(createdPortfolio.id)) ||
      createdPortfolio

    log.success(
      `Portfolio created: ${finalPortfolio.name}`,
      undefined,
      "AgentService"
    )
    return finalPortfolio
  }

  async getPortfolio(id: string): Promise<Portfolio | null> {
    return this.repository.getPortfolio(id)
  }

  async getAllPortfolios(userId: string): Promise<Portfolio[]> {
    return this.repository.getAllPortfolios(userId)
  }

  async createPortfolioDraftFromThesis(
    thesis: string,
    userId: string,
    options: { name?: string; description?: string } = {}
  ): Promise<Portfolio> {
    const trimmedThesis = thesis.trim()
    if (!trimmedThesis) {
      throw new Error("Thesis is required to generate a portfolio draft")
    }

    const now = new Date()
    const defaultName = `Draft Portfolio ${now.toISOString().split("T")[0]}`

    const basePortfolio = await this.createPortfolio(
      {
        name: options.name?.trim() || defaultName,
        description:
          options.description?.trim() ||
          "Draft portfolio generated via the Portfolio Wizard.",
        thesis: trimmedThesis,
        assignedAgentIds: [],
        isActive: false,
        metadata: {
          origin: "wizard",
          stage: "draft",
        },
      },
      userId
    )

    try {
      const { plan, positions, raw } = await this.portfolioPlanService.generatePlan(
        basePortfolio,
        userId
      )

      const updated = await this.repository.updatePortfolio(basePortfolio.id, {
        positions,
        metadata: {
          ...(basePortfolio.metadata ?? {}),
          origin: "wizard",
          stage: "draft",
          portfolioSummary: plan.portfolio_summary,
          riskManagement: plan.risk_management,
          portfolioManagerOutput: raw,
        },
        isActive: false,
      })

      log.success(
        `Portfolio draft created with ${positions.length} positions`,
        undefined,
        "AgentService"
      )

      return updated
    } catch (error) {
      log.failure(
        "Failed to generate portfolio positions from thesis",
        error,
        "AgentService"
      )
      return basePortfolio
    }
  }

  async updatePortfolio(
    id: string,
    request: UpdatePortfolioRequest
  ): Promise<Portfolio> {
    const existing = await this.repository.getPortfolio(id)
    if (!existing) throw new Error(`Portfolio ${id} not found`)

    const updates: Partial<Portfolio> & { assignedAgents?: AssignedAgent[] } = {}

    if (request.name !== undefined) updates.name = request.name
    if (request.description !== undefined)
      updates.description = request.description
    if (request.thesis !== undefined) updates.thesis = request.thesis
    if (request.positions !== undefined) updates.positions = request.positions
    if (request.metadata !== undefined) updates.metadata = request.metadata
    if (request.isActive !== undefined) updates.isActive = request.isActive

    if (request.assignedAgentIds) {
      const portfolioManager = await this.portfolioManagerAgent.ensureAgent()
      const normalizedAgentIds = Array.from(
        new Set([portfolioManager.id, ...request.assignedAgentIds])
      )

      const allAgents = await this.getAllAgents()
      const assignedAgents = normalizedAgentIds.map((agentId) => {
        const agent = allAgents.find((a) => a.id === agentId)
        if (!agent) throw new Error(`Agent ${agentId} not found`)

        const assignment: AssignedAgent = {
          agentId,
          agent,
          assignedAt: new Date(),
          assignedBy: existing.userId,
          isActive: true,
          workCount: 0,
        }

        return assignment
      })

      updates.assignedAgents = assignedAgents
    }

    const updated = await this.repository.updatePortfolio(id, updates)

    log.success(
      `Portfolio updated: ${updated.name}`,
      undefined,
      "AgentService"
    )
    return updated
  }

  async deletePortfolio(id: string): Promise<void> {
    await this.repository.deletePortfolio(id)
    log.info(`Portfolio deleted: ${id}`, undefined, "AgentService")
  }

  async assignAgent(
    portfolioId: string,
    agentId: string,
    assignedBy: string
  ): Promise<void> {
    const portfolio = await this.repository.getPortfolio(portfolioId)
    if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`)

    const agent = await this.repository.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    const existingAssignment = portfolio.assignedAgents.find(
      (a) => a.agentId === agentId
    )
    if (existingAssignment) {
      throw new Error(
        `Agent ${agentId} is already assigned to portfolio ${portfolioId}`
      )
    }

    const assignedAgent: AssignedAgent = {
      agentId,
      agent,
      assignedAt: new Date(),
      assignedBy,
      isActive: true,
      workCount: 0,
    }

    await this.repository.updatePortfolio(portfolioId, {
      assignedAgents: [...portfolio.assignedAgents, assignedAgent],
    })

    log.success(
      `Agent ${agent.name} assigned to portfolio ${portfolio.name}`,
      undefined,
      "AgentService"
    )
  }

  async unassignAgent(portfolioId: string, agentId: string): Promise<void> {
    const portfolioManager = await this.portfolioManagerAgent.ensureAgent()
    if (agentId === portfolioManager.id) {
      throw new Error("The Portfolio Manager cannot be unassigned")
    }

    const portfolio = await this.repository.getPortfolio(portfolioId)
    if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`)

    const remainingAssignments = portfolio.assignedAgents.filter(
      (a) => a.agentId !== agentId
    )

    await this.repository.updatePortfolio(portfolioId, {
      assignedAgents: remainingAssignments,
    })

    log.info(
      `Agent ${agentId} unassigned from portfolio ${portfolioId}`,
      undefined,
      "AgentService"
    )
  }

  // Work Execution
  async executeWork(
    portfolioId: string,
    agentId: string,
    userId: string
  ): Promise<AgentWork> {
    const portfolio = await this.repository.getPortfolio(portfolioId)
    if (!portfolio) throw new Error(`Portfolio ${portfolioId} not found`)

    const assignedAgent = portfolio.assignedAgents.find(
      (a) => a.agentId === agentId
    )
    if (!assignedAgent)
      throw new Error(
        `Agent ${agentId} is not assigned to portfolio ${portfolioId}`
      )

    const work: AgentWork = {
      id: this.generateId(),
      portfolioId,
      agentId,
      agent: assignedAgent.agent,
      thesis: portfolio.thesis,
      status: "pending",
      startedAt: new Date(),
    }

    const createdWork = await this.repository.createWork(work)

    void this.workExecutor.run(createdWork)

    return createdWork
  }

  async getWork(id: string): Promise<AgentWork | null> {
    return this.repository.getWork(id)
  }

  async getWorkHistory(portfolioId: string): Promise<AgentWork[]> {
    return this.repository.getWorkHistory(portfolioId)
  }

  async cancelWork(id: string): Promise<void> {
    const work = await this.repository.getWork(id)
    if (!work) throw new Error(`Work ${id} not found`)

    if (work.status === "running" || work.status === "pending") {
      await this.repository.updateWork(id, {
        status: "cancelled",
        completedAt: new Date(),
      })
      log.info(`Work cancelled: ${id}`, undefined, "AgentService")
    }
  }

  private generateId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const agentService = new AgentService()
export default agentService
