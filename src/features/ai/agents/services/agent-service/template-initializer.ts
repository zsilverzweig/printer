import { log } from "@/lib/utils/logger"

import { AgentRepository } from "../firestore/agent-repository"
import { createDefaultAgentTemplates } from "../templates/default-agent-templates"

export class AgentTemplateInitializer {
  private initialized = false

  constructor(private readonly repository: AgentRepository) {}

  async ensureDefaultTemplates(): Promise<void> {
    if (this.initialized) return

    const defaultTemplates = createDefaultAgentTemplates()
    for (const template of defaultTemplates) {
      const existingTemplate = await this.repository.getTemplate(template.id)
      if (!existingTemplate) {
        await this.repository.createTemplate(template)
      }
    }

    this.initialized = true
    log.info("Default agent templates initialized", undefined, "AgentService")
  }
}
