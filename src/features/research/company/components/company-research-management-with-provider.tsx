"use client";

import { useState, useCallback } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card, CardContent } from "@/lib/components/ui/card";
import { log } from "@/lib/utils/logger";

import { useCompanyResearchContext } from "../providers/company-research-provider";
import { CreateCompanyResearchRequest } from "../types";

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
      {/* Header with New Research Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Company Research</h1>
          <p className="text-muted-foreground">
            Use AI agents to conduct deep research on companies and build your investment knowledge base.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          New Research
        </Button>
      </div>

      {/* Research List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Research Archive */}
        <div className="lg:col-span-1">
          <CompanyResearchList
            research={filteredResearch}
            selectedResearch={selectedResearch}
            onSelectResearch={selectResearch}
            onDeleteResearch={handleDeleteResearch}
            loading={loading}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
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
                    or create new research using the &quot;New Research&quot; button.
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
