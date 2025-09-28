"use client";

import { useState, useCallback } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";

import { log } from "@/lib/utils/logger";

import { CreateCompanyResearchRequest } from "../types";
import { useCompanyResearchContext } from "../providers/company-research-provider";

import { CompanyResearchDetails } from "./company-research-details";
import { CompanyResearchList } from "./company-research-list";
import { CreateResearchDialog } from "./create-research-dialog";

export function CompanyResearchManagementWithProvider() {
  const {
    research,
    selectedResearch,
    loading,
    error,
    selectResearch,
  } = useCompanyResearchContext();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // Debug logging to see if component is receiving updates
  console.log("CompanyResearchManagementWithProvider render", {
    researchCount: research.length,
    selectedResearchId: selectedResearch?.id,
    selectedResearchStatus: selectedResearch?.status,
    loading,
    error
  });

  const handleCreateResearch = useCallback(async (request: CreateCompanyResearchRequest) => {
    try {
      setCreating(true);
      
      log.info("Creating new company research", { 
        companyTicker: request.companyTicker,
        researchFocus: request.researchFocus 
      }, "CompanyResearchManagementWithProvider");

      const response = await fetch("/api/research/company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create company research");
      }

      const data = await response.json();
      const newResearch = data.research;
      
      log.success(
        `Company research created: ${newResearch.companyTicker}`,
        { researchId: newResearch.id, status: newResearch.status },
        "CompanyResearchManagementWithProvider"
      );
      
      setShowCreateDialog(false);
      
      // The real-time listener will automatically update the research list
      // and show the new research with its current status
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create company research";
      log.error("Failed to create company research", err, "CompanyResearchManagementWithProvider");
      throw new Error(errorMessage);
    } finally {
      setCreating(false);
    }
  }, []);

  const handleDeleteResearch = useCallback(async (id: string) => {
    try {
      log.info("Deleting company research", { researchId: id }, "CompanyResearchManagementWithProvider");

      const response = await fetch(`/api/research/company/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete research");
      }

      // Clear selection if deleted research was selected
      if (selectedResearch?.id === id) {
        selectResearch(null);
      }

      log.success(
        `Research deleted: ${id}`,
        undefined,
        "CompanyResearchManagementWithProvider"
      );

      // The real-time listener will automatically remove the deleted research
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete research";
      log.error("Failed to delete research", err, "CompanyResearchManagementWithProvider");
      throw new Error(errorMessage);
    }
  }, [selectedResearch, selectResearch]);

  const filteredResearch = research.filter((item) =>
    item.companyTicker.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.agentName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && research.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading research history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <h3 className="text-lg font-medium">Error Loading Research</h3>
            <p className="text-sm">{error}</p>
          </div>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Create Section */}
      <Card>
        <CardHeader>
          <CardTitle>Research Companies</CardTitle>
          <CardDescription>
            Use AI agents to conduct deep research on companies and build your investment knowledge base.
            {research.length > 0 && (
              <span className="block mt-1 text-sm">
                {research.filter(r => r.status === 'in_progress').length > 0 && (
                  <span className="text-blue-600">
                    {research.filter(r => r.status === 'in_progress').length} research in progress
                  </span>
                )}
                {research.filter(r => r.status === 'completed').length > 0 && (
                  <span className="text-green-600 ml-2">
                    {research.filter(r => r.status === 'completed').length} completed
                  </span>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Search */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search Research History</Label>
              <Input
                id="search"
                placeholder="Search by ticker, company name, or agent..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="pt-6">
              <Button onClick={() => setShowCreateDialog(true)}>
                New Research
              </Button>
            </div>
          </div>

          {/* Agent Info */}
          <div className="text-sm text-muted-foreground">
            <span>
              AI-powered company research agent available for comprehensive analysis
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Research List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Research History */}
        <div className="lg:col-span-1">
          <CompanyResearchList
            research={filteredResearch}
            selectedResearch={selectedResearch}
            onSelectResearch={selectResearch}
            onDeleteResearch={handleDeleteResearch}
            loading={loading}
          />
        </div>

        {/* Research Details */}
        <div className="lg:col-span-2">
          {selectedResearch ? (
            <CompanyResearchDetails
              research={selectedResearch}
            />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-muted-foreground">
                  <h3 className="text-lg font-medium mb-2">Select Research to View</h3>
                  <p>
                    Choose a research report from the list to view the detailed analysis, 
                    or create new research using the "New Research" button.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Research Dialog */}
      <CreateResearchDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateResearch={handleCreateResearch}
        creating={creating}
      />
    </div>
  );
}
