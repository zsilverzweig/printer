import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore"

import { db, COLLECTIONS } from "@/lib/services/firebase"

import {
  Agent,
  AgentTemplate,
  AgentVersion,
  AgentWork,
  AssignedAgent,
  Portfolio,
} from "../../types"

import {
  deserializeAgent,
  deserializeAgentVersion,
  deserializePortfolio,
  deserializeTemplate,
  deserializeWork,
  serializeAgent,
  serializeAgentVersion,
  serializePortfolio,
  serializeTemplate,
  serializeWork,
} from "./converters"

export interface AgentRepository {
  createAgent(agent: Agent): Promise<Agent>
  getAgent(id: string): Promise<Agent | null>
  getAllAgents(): Promise<Agent[]>
  updateAgent(id: string, updates: Partial<Agent>): Promise<Agent>
  deleteAgent(id: string): Promise<void>

  createAgentVersion(version: AgentVersion): Promise<AgentVersion>
  getAgentVersions(agentId: string): Promise<AgentVersion[]>

  createTemplate(template: AgentTemplate): Promise<AgentTemplate>
  getTemplate(id: string): Promise<AgentTemplate | null>
  getAllTemplates(): Promise<AgentTemplate[]>

  createPortfolio(portfolio: Portfolio): Promise<Portfolio>
  getPortfolio(id: string): Promise<Portfolio | null>
  getAllPortfolios(userId: string): Promise<Portfolio[]>
  updatePortfolio(
    id: string,
    updates: Partial<Portfolio> & { assignedAgents?: AssignedAgent[] }
  ): Promise<Portfolio>
  deletePortfolio(id: string): Promise<void>

  createWork(work: AgentWork): Promise<AgentWork>
  getWork(id: string): Promise<AgentWork | null>
  updateWork(id: string, updates: Partial<AgentWork>): Promise<AgentWork>
  getWorkHistory(portfolioId: string): Promise<AgentWork[]>
}

export class FirestoreAgentRepository implements AgentRepository {
  async createAgent(agent: Agent): Promise<Agent> {
    const ref = doc(db, COLLECTIONS.AGENTS, agent.id)
    await setDoc(ref, serializeAgent(agent))
    return agent
  }

  async getAgent(id: string): Promise<Agent | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.AGENTS, id))
    if (!snapshot.exists()) {
      return null
    }
    return deserializeAgent(snapshot.id, snapshot.data())
  }

  async getAllAgents(): Promise<Agent[]> {
    const snapshot = await getDocs(collection(db, COLLECTIONS.AGENTS))
    return snapshot.docs.map((docSnap) =>
      deserializeAgent(docSnap.id, docSnap.data())
    )
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
    const existing = await this.getAgent(id)
    if (!existing) throw new Error(`Agent ${id} not found`)

    const updated: Agent = {
      ...existing,
      ...updates,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    }

    const ref = doc(db, COLLECTIONS.AGENTS, id)
    await setDoc(ref, serializeAgent(updated))

    return updated
  }

  async deleteAgent(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.AGENTS, id))

    const versionsSnapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.AGENT_VERSIONS),
        where("agentId", "==", id)
      )
    )

    await Promise.all(
      versionsSnapshot.docs.map((versionDoc) => deleteDoc(versionDoc.ref))
    )
  }

  async createAgentVersion(version: AgentVersion): Promise<AgentVersion> {
    const ref = doc(db, COLLECTIONS.AGENT_VERSIONS, version.id)
    await setDoc(ref, serializeAgentVersion(version))
    return version
  }

  async getAgentVersions(agentId: string): Promise<AgentVersion[]> {
    const versionsSnapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.AGENT_VERSIONS),
        where("agentId", "==", agentId)
      )
    )

    return versionsSnapshot.docs
      .map((docSnap) =>
        deserializeAgentVersion(docSnap.id, docSnap.data())
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  async createTemplate(template: AgentTemplate): Promise<AgentTemplate> {
    const ref = doc(db, COLLECTIONS.AGENT_TEMPLATES, template.id)
    await setDoc(ref, serializeTemplate(template), { merge: true })
    return template
  }

  async getTemplate(id: string): Promise<AgentTemplate | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.AGENT_TEMPLATES, id))
    if (!snapshot.exists()) {
      return null
    }
    return deserializeTemplate(snapshot.id, snapshot.data())
  }

  async getAllTemplates(): Promise<AgentTemplate[]> {
    const snapshot = await getDocs(collection(db, COLLECTIONS.AGENT_TEMPLATES))
    return snapshot.docs.map((docSnap) =>
      deserializeTemplate(docSnap.id, docSnap.data())
    )
  }

  async createPortfolio(portfolio: Portfolio): Promise<Portfolio> {
    const ref = doc(db, COLLECTIONS.PORTFOLIOS, portfolio.id)
    await setDoc(ref, serializePortfolio(portfolio))
    return portfolio
  }

  async getPortfolio(id: string): Promise<Portfolio | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.PORTFOLIOS, id))
    if (!snapshot.exists()) {
      return null
    }
    return deserializePortfolio(snapshot.id, snapshot.data())
  }

  async getAllPortfolios(userId: string): Promise<Portfolio[]> {
    const snapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.PORTFOLIOS),
        where("userId", "==", userId)
      )
    )

    return snapshot.docs.map((docSnap) =>
      deserializePortfolio(docSnap.id, docSnap.data())
    )
  }

  async updatePortfolio(
    id: string,
    updates: Partial<Portfolio> & { assignedAgents?: AssignedAgent[] }
  ): Promise<Portfolio> {
    const existing = await this.getPortfolio(id)
    if (!existing) throw new Error(`Portfolio ${id} not found`)

    const updated: Portfolio = {
      ...existing,
      updatedAt: new Date(),
    }

    if (updates.name !== undefined) updated.name = updates.name
    if (updates.description !== undefined)
      updated.description = updates.description
    if (updates.thesis !== undefined) updated.thesis = updates.thesis
    if (updates.assignedAgents !== undefined)
      updated.assignedAgents = updates.assignedAgents
    if (updates.positions !== undefined) updated.positions = updates.positions
    if (updates.metadata !== undefined) updated.metadata = updates.metadata
    if (updates.isActive !== undefined) updated.isActive = updates.isActive

    const ref = doc(db, COLLECTIONS.PORTFOLIOS, id)
    await setDoc(ref, serializePortfolio(updated))

    return updated
  }

  async deletePortfolio(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTIONS.PORTFOLIOS, id))
  }

  async createWork(work: AgentWork): Promise<AgentWork> {
    const ref = doc(db, COLLECTIONS.AGENT_WORK, work.id)
    await setDoc(ref, serializeWork(work))
    return work
  }

  async getWork(id: string): Promise<AgentWork | null> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.AGENT_WORK, id))
    if (!snapshot.exists()) {
      return null
    }
    return deserializeWork(snapshot.id, snapshot.data())
  }

  async updateWork(
    id: string,
    updates: Partial<AgentWork>
  ): Promise<AgentWork> {
    const existing = await this.getWork(id)
    if (!existing) throw new Error(`Work ${id} not found`)

    const updated: AgentWork = {
      ...existing,
      ...updates,
    }

    if (updates.completedAt !== undefined) {
      updated.completedAt = updates.completedAt
    }

    const ref = doc(db, COLLECTIONS.AGENT_WORK, id)
    await setDoc(ref, serializeWork(updated))

    return updated
  }

  async getWorkHistory(portfolioId: string): Promise<AgentWork[]> {
    const snapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.AGENT_WORK),
        where("portfolioId", "==", portfolioId)
      )
    )

    return snapshot.docs
      .map((docSnap) => deserializeWork(docSnap.id, docSnap.data()))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  }
}
