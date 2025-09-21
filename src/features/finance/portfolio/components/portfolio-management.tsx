"use client";

import { useAgents } from "@/features/ai/agents/hooks/use-agents";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { useState } from "react";
import { usePortfolios } from "../hooks/use-portfolios";
import { CreatePortfolioRequest, Portfolio } from "../types";
import { CreatePortfolioDialog } from "./create-portfolio-dialog";
import { PortfolioDetailsDialog } from "./portfolio-details-dialog";
import { PortfolioList } from "./portfolio-list";

interface PortfolioManagementProps {
  userId: string;
}

export function PortfolioManagement({ userId }: PortfolioManagementProps) {
  const {
    portfolios,
    loading,
    error,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
  } = usePortfolios(userId);
  const { agents } = useAgents();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPortfolios = portfolios.filter(
    (portfolio) =>
      portfolio.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      portfolio.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      portfolio.thesis.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreatePortfolio = async (request: CreatePortfolioRequest) => {
    try {
      await createPortfolio(request);
      setShowCreateDialog(false);
    } catch (error) {
      console.error("Failed to create portfolio:", error);
    }
  };

  const handleUpdatePortfolio = async (
    portfolioId: string,
    updates: Partial<Portfolio>
  ) => {
    try {
      await updatePortfolio(portfolioId, updates);
      setSelectedPortfolio(null);
    } catch (error) {
      console.error("Failed to update portfolio:", error);
    }
  };

  const handleDeletePortfolio = async (portfolioId: string) => {
    if (confirm("Are you sure you want to delete this portfolio?")) {
      try {
        await deletePortfolio(portfolioId);
      } catch (error) {
        console.error("Failed to delete portfolio:", error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading portfolios...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="text-red-800">
              <h3 className="font-semibold mb-2">Error Loading Portfolios</h3>
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Portfolios</h1>
          <p className="text-gray-600 mt-2">
            Create and manage your investment portfolios with AI agents
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          Create Portfolio
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Portfolios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolios.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Active Portfolios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {portfolios.filter((portfolio) => portfolio.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Agents Assigned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {portfolios.reduce(
                (total, portfolio) => total + portfolio.assignedAgents.length,
                0
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            placeholder="Search portfolios by name, description, or thesis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </div>

      {/* Portfolio List */}
      <PortfolioList
        portfolios={filteredPortfolios}
        onSelectPortfolio={setSelectedPortfolio}
        onDeletePortfolio={handleDeletePortfolio}
      />

      {/* Dialogs */}
      <CreatePortfolioDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        availableAgents={agents.filter((agent) => agent.isActive)}
        onCreatePortfolio={handleCreatePortfolio}
      />

      <PortfolioDetailsDialog
        portfolio={selectedPortfolio}
        availableAgents={agents.filter((agent) => agent.isActive)}
        onClose={() => setSelectedPortfolio(null)}
        onUpdatePortfolio={handleUpdatePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
      />
    </div>
  );
}
