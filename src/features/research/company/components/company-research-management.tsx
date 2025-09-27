"use client";

import { useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

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
      {/* Search and Create Section */}
      <Card>
        <CardHeader>
          <CardTitle>Research Companies</CardTitle>
          <CardDescription>
            Use AI agents to conduct deep research on companies and build your investment knowledge base.
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
            onDeleteResearch={deleteResearch}
            loading={loading}
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
