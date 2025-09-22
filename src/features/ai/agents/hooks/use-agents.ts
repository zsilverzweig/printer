// React hook for managing AI agents

import { useCallback, useEffect, useState } from "react";

import { log } from "@/lib/utils/logger";

import {
  Agent,
  AgentTemplate,
  AgentVersion,
  CreateAgentRequest,
  UpdateAgentRequest,
  UseAgentsReturn,
} from "../types";

export function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentsResponse, templatesResponse] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/agents/templates"),
      ]);

      if (!agentsResponse.ok || !templatesResponse.ok) {
        throw new Error("Failed to fetch data");
      }

      const [agentsData, templatesData] = await Promise.all([
        agentsResponse.json(),
        templatesResponse.json(),
      ]);

      setAgents(agentsData.agents || []);
      setTemplates(templatesData.templates || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load agents";
      setError(errorMessage);
      // Set empty arrays as fallback
      setAgents([]);
      setTemplates([]);
      log.failure("Failed to load agents data", err, "useAgents");
    } finally {
      setLoading(false);
    }
  };

  const createAgent = useCallback(
    async (request: CreateAgentRequest): Promise<Agent> => {
      try {
        setError(null);
        const response = await fetch("/api/agents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error("Failed to create agent");
        }

        const data = await response.json();
        const newAgent = data.agent;
        setAgents((prev) => [...prev, newAgent]);
        log.success(`Agent created: ${newAgent.name}`, undefined, "useAgents");
        return newAgent;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create agent";
        setError(errorMessage);
        log.failure("Failed to create agent", err, "useAgents");
        throw err;
      }
    },
    []
  );

  const updateAgent = useCallback(
    async (agentId: string, request: UpdateAgentRequest): Promise<Agent> => {
      try {
        setError(null);
        const response = await fetch(`/api/agents/${agentId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error("Failed to update agent");
        }

        const data = await response.json();
        const updatedAgent = data.agent;
        setAgents((prev) =>
          prev.map((agent) => (agent.id === agentId ? updatedAgent : agent))
        );
        log.success(
          `Agent updated: ${updatedAgent.name}`,
          undefined,
          "useAgents"
        );
        return updatedAgent;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update agent";
        setError(errorMessage);
        log.failure("Failed to update agent", err, "useAgents");
        throw err;
      }
    },
    []
  );

  const deleteAgent = useCallback(async (agentId: string): Promise<void> => {
    try {
      setError(null);
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete agent");
      }

      setAgents((prev) => prev.filter((agent) => agent.id !== agentId));
      log.success(`Agent deleted: ${agentId}`, undefined, "useAgents");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete agent";
      setError(errorMessage);
      log.failure("Failed to delete agent", err, "useAgents");
      throw err;
    }
  }, []);

  const getAgentVersions = useCallback(async (): Promise<AgentVersion[]> => {
    try {
      setError(null);
      // For now, return empty array since we don't have a versions API endpoint yet
      // TODO: Implement versions API endpoint
      return [];
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get agent versions";
      setError(errorMessage);
      log.failure("Failed to get agent versions", err, "useAgents");
      throw err;
    }
  }, []);

  const revertToVersion = useCallback(
    async (agentId: string): Promise<Agent> => {
      try {
        setError(null);
        // For now, just return the current agent since we don't have versioning API yet
        // TODO: Implement versioning API endpoint
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) throw new Error("Agent not found");
        return agent;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to revert agent version";
        setError(errorMessage);
        log.failure("Failed to revert agent version", err, "useAgents");
        throw err;
      }
    },
    [agents]
  );

  return {
    agents,
    templates,
    loading,
    error,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgentVersions,
    revertToVersion,
  };
}
