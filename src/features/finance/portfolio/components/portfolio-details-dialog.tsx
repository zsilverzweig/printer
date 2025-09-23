"use client";

import React, { useState } from "react";

import { AgentWorkCard } from "@/features/ai/agents/components/agent-work-card";
import { useAgentWork } from "@/features/ai/agents/hooks/use-agent-work";
import { Agent } from "@/features/ai/agents/types";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Modal } from "@/lib/components/ui/modal";
import { log } from "@/lib/utils/logger";

import { Portfolio, UpdatePortfolioRequest } from "../types";

interface PortfolioDetailsDialogProps {
  portfolio: Portfolio | null;
  availableAgents: Agent[];
  onClose: () => void;
  onUpdatePortfolio: (
    portfolioId: string,
    updates: Partial<Portfolio>
  ) => Promise<void>;
  onDeletePortfolio: (portfolioId: string) => void;
}

export function PortfolioDetailsDialog({
  portfolio,
  availableAgents,
  onClose,
  onUpdatePortfolio,
  onDeletePortfolio,
}: PortfolioDetailsDialogProps) {
  const {
    workHistory,
    executeWork,
    loading: workLoading,
  } = useAgentWork(portfolio?.id || "");
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UpdatePortfolioRequest>({});
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  React.useEffect(() => {
    if (portfolio) {
      setFormData({
        name: portfolio.name,
        description: portfolio.description,
        thesis: portfolio.thesis,
      });
      setSelectedAgentIds(portfolio.assignedAgents.map((a) => a.agentId));
    }
  }, [portfolio]);

  const handleSave = async () => {
    if (!portfolio) return;

    try {
      await onUpdatePortfolio(portfolio.id, {
        ...formData,
        assignedAgentIds: selectedAgentIds,
      } as any);
      setEditing(false);
    } catch (error) {
      log.failure(
        "Failed to update portfolio",
        error,
        "PortfolioDetailsDialog"
      );
    }
  };

  const handleDelete = () => {
    if (!portfolio) return;

    if (
      confirm(
        "Are you sure you want to delete this portfolio? This action cannot be undone."
      )
    ) {
      onDeletePortfolio(portfolio.id);
      onClose();
    }
  };

  const handleAgentToggle = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleExecuteWork = async (agentId: string) => {
    if (!portfolio) return;

    try {
      await executeWork(portfolio.id, agentId);
    } catch (error) {
      log.failure("Failed to execute work", error, "PortfolioDetailsDialog");
    }
  };

  if (!portfolio) return null;

  const portfolioMetadata = (portfolio.metadata || {}) as {
    portfolioSummary?: string;
    riskManagement?: string;
  };

  return (
    <Modal
      open={Boolean(portfolio)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Portfolio Details"
      size="2xl"
      className="max-w-6xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete Portfolio
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Portfolio Information</CardTitle>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? "Cancel" : "Edit"}
                </Button>
                {editing && (
                  <Button size="sm" onClick={handleSave}>
                    Save
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                {editing ? (
                  <Input
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-foreground">{portfolio.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Badge variant={portfolio.isActive ? "default" : "secondary"}>
                  {portfolio.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              {editing ? (
                <Input
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      description: e.target.value,
                    })
                  }
                />
              ) : (
                <p className="text-foreground">{portfolio.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Created
                </label>
                <p className="text-foreground">
                  {new Date(portfolio.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Last Updated
                </label>
                <p className="text-foreground">
                  {new Date(portfolio.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Investment Thesis */}
        <Card>
          <CardHeader>
            <CardTitle>Investment Thesis</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <textarea
                value={formData.thesis || ""}
                onChange={(e) =>
                  setFormData({ ...formData, thesis: e.target.value })
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                rows={6}
              />
            ) : (
              <div className="bg-muted p-4 rounded-md">
                <p className="whitespace-pre-wrap text-foreground">
                  {portfolio.thesis}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Positions</CardTitle>
            <CardDescription>
              Draft trade recommendations generated by the Portfolio Manager
              agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            {portfolio.positions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No positions have been generated yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                {portfolioMetadata.portfolioSummary && (
                  <div className="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm">
                    <p className="font-medium text-foreground">Portfolio Summary</p>
                    <p className="text-muted-foreground">
                      {portfolioMetadata.portfolioSummary}
                    </p>
                  </div>
                )}
                {portfolioMetadata.riskManagement && (
                  <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Risk Guidance</p>
                    <p>{portfolioMetadata.riskManagement}</p>
                  </div>
                )}
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Symbol</th>
                      <th className="py-2 pr-4 font-medium">Side</th>
                      <th className="py-2 pr-4 font-medium">Exposure</th>
                      <th className="py-2 pr-4 font-medium">Quantity</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Target</th>
                      <th className="py-2 pr-4 font-medium">Stop</th>
                      <th className="py-2 pr-4 font-medium">Confidence</th>
                      <th className="py-2 pr-4 font-medium">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {portfolio.positions.map((position) => (
                      <tr key={position.id} className="align-top">
                        <td className="py-3 pr-4 font-semibold text-foreground">
                          {position.symbol}
                        </td>
                        <td className="py-3 pr-4 capitalize">
                          {position.side}
                        </td>
                        <td className="py-3 pr-4 capitalize">
                          {position.positionSide}
                        </td>
                        <td className="py-3 pr-4">
                          {position.quantity.toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 capitalize">
                          {position.status.replace("_", " ")}
                        </td>
                        <td className="py-3 pr-4">
                          {position.targetPrice !== undefined
                            ? `$${position.targetPrice.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {position.stopLoss !== undefined
                            ? `$${position.stopLoss.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : "—"}
                        </td>
                        <td className="py-3 pr-4 capitalize">
                          {position.confidence || "—"}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {position.rationale}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assigned Agents */}
        <Card>
          <CardHeader>
            <CardTitle>Assigned AI Agents</CardTitle>
            <CardDescription>
              {editing
                ? "Select agents to analyze this portfolio"
                : "Agents assigned to analyze this portfolio"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableAgents.map((agent) => (
                  <Card
                    key={agent.id}
                    className={`cursor-pointer transition-colors ${
                      selectedAgentIds.includes(agent.id)
                        ? "ring-2 ring-primary bg-primary/10"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handleAgentToggle(agent.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{agent.name}</CardTitle>
                        <input
                          type="checkbox"
                          checked={selectedAgentIds.includes(agent.id)}
                          onChange={() => handleAgentToggle(agent.id)}
                          className="rounded border-border"
                        />
                      </div>
                      <CardDescription className="text-xs">
                        {agent.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {portfolio.assignedAgents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No agents assigned
                  </p>
                ) : (
                  portfolio.assignedAgents.map((assignedAgent) => (
                    <div
                      key={assignedAgent.agentId}
                      className="flex items-center justify-between p-3 border rounded-md"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">
                          {assignedAgent.agent.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {assignedAgent.agent.description}
                        </p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                          <span>Model: {assignedAgent.agent.model.name}</span>
                          <span>
                            Role: {assignedAgent.agent.role.replace("_", " ")}
                          </span>
                          <span>Work Count: {assignedAgent.workCount}</span>
                          {assignedAgent.lastWorkedAt && (
                            <span>
                              Last Worked:{" "}
                              {new Date(
                                assignedAgent.lastWorkedAt
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => handleExecuteWork(assignedAgent.agentId)}
                        disabled={workLoading}
                        size="sm"
                      >
                        {workLoading ? "Working..." : "Work"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Work History */}
        <Card>
          <CardHeader>
            <CardTitle>Work History</CardTitle>
            <CardDescription>
              Recent AI agent analysis and responses
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workHistory.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No work history available
              </p>
            ) : (
              <div className="space-y-4">
                {workHistory.map((work) => (
                  <AgentWorkCard key={work.id} work={work} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Modal>
  );
}
