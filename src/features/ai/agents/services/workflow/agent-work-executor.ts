import { aiService, createAIRequest } from "@/lib/services/ai-service"
import { AIAgent } from "@/lib/types/ai"
import { log } from "@/lib/utils/logger"

import { Agent, AgentWork } from "../../types"
import { AgentRepository } from "../firestore/agent-repository"

export class AgentWorkExecutor {
  constructor(private readonly repository: AgentRepository) {}

  async run(work: AgentWork): Promise<void> {
    try {
      await this.repository.updateWork(work.id, { status: "running" })

      const aiAgent = this.toAIAgent(work.agent)
      const request = createAIRequest(
        work.agent.id,
        `Investment Thesis Analysis:\n\n${work.thesis}`,
        { portfolioId: work.portfolioId, workId: work.id },
        work.portfolioId
      )

      const response = await aiService.generateResponse(
        aiAgent,
        request,
        "thesis_generation"
      )

      await this.repository.updateWork(work.id, {
        status: "completed",
        request,
        response,
        completedAt: new Date(),
      })

      const portfolio = await this.repository.getPortfolio(work.portfolioId)
      if (portfolio) {
        const assignedAgent = portfolio.assignedAgents.find(
          (a) => a.agentId === work.agentId
        )
        if (assignedAgent) {
          assignedAgent.workCount += 1
          assignedAgent.lastWorkedAt = new Date()
          await this.repository.updatePortfolio(work.portfolioId, {
            assignedAgents: portfolio.assignedAgents,
          })
        }
      }

      log.success(`Work completed: ${work.id}`, undefined, "AgentWorkExecutor")
    } catch (error) {
      await this.repository.updateWork(work.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      })

      log.failure(`Work failed: ${work.id}`, error, "AgentWorkExecutor")
    }
  }

  private toAIAgent(agent: Agent): AIAgent {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      role: agent.role,
      model: agent.model,
      systemPrompt: agent.promptGuidance,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      version: agent.version,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      isActive: agent.isActive,
      metadata: agent.metadata,
    }
  }
}
