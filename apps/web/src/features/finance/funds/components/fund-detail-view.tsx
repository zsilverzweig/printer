/**
 * FundDetailView Component
 *
 * Main component for the fund detail page with tabbed interface.
 */

"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

import { useFundDetails } from "../hooks/use-fund-details";
import { setupService } from "../services/setup-service";
import { CreateSetupInput } from "../types";

import { FundOverview } from "./fund-overview";
import { SetupEditor } from "./setup-editor";
import { SetupSelector } from "./setup-selector";
import { StrategyEditor } from "./strategy-editor";

interface FundDetailViewProps {
  fundId: string;
}

export function FundDetailView({ fundId }: FundDetailViewProps) {
  const { details, loading, error, refresh } = useFundDetails(fundId);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [showSetupEditor, setShowSetupEditor] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading fund details...</p>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="p-8">
        <div className="rounded-md bg-red-50 p-6 border border-red-200">
          <div className="text-red-800">
            <h3 className="font-semibold mb-2">Error Loading Fund</h3>
            <p>{error || "Fund not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { fund, strategy, setup } = details;

  const handleSaveSetup = async (input: CreateSetupInput) => {
    const newSetup = await setupService.createSetup(input);
    setSelectedSetupId(newSetup.id);
    setShowSetupEditor(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/funds">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{fund.name}</h1>
            {fund.description && (
              <p className="text-muted-foreground mt-1">{fund.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-[600px] grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <FundOverview fund={fund} onFundUpdate={refresh} />
        </TabsContent>

        <TabsContent value="strategy" className="space-y-6">
          <StrategyEditor
            fundId={fund.id}
            strategy={strategy}
            onUpdate={refresh}
          />
        </TabsContent>

        <TabsContent value="setup" className="space-y-6">
          <SetupSelector
            selectedSetupId={selectedSetupId}
            onSelectSetup={setSelectedSetupId}
            onCreateNew={() => setShowSetupEditor(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Setup Editor Dialog */}
      <SetupEditor
        open={showSetupEditor}
        onOpenChange={setShowSetupEditor}
        onSave={handleSaveSetup}
      />
    </div>
  );
}
