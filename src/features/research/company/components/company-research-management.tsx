"use client";

import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card, CardContent } from "@/lib/components/ui/card";

import { useCompanyResearch } from "../hooks/use-company-research";
import { CreateCompanyResearchRequest } from "../types";

import { CompanyResearchDetails } from "./company-research-details";
import { CompanyResearchList } from "./company-research-list";
import { CreateResearchDialog } from "./create-research-dialog";

interface CompanyResearchManagementProps {
  userId: string;
}

export function CompanyResearchManagement({ userId }: CompanyResearchManagementProps) {
  const {
    research,
    selectedResearch,
    loading,
    creating,
    error,
    createResearch,
    selectResearch,
    deleteResearch,
    refreshResearch,
  } = useCompanyResearch(userId);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleCreateResearch = async (request: CreateCompanyResearchRequest) => {
    try {
      await createResearch(request);
      setShowCreateDialog(false);
    } catch {
      // Error handling is done in the hook
    }
  };

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
            onDeleteResearch={deleteResearch}
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
              onRefresh={refreshResearch}
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
