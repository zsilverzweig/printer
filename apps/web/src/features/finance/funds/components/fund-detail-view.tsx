/**
 * FundDetailView Component
 *
 * Main component for the fund detail page with tabbed interface.
 */

"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

import { useFundDetails } from "../hooks/use-fund-details";
import { useFundLedger } from "../hooks/use-fund-ledger";
import { setupService } from "../services/setup-service";
import { CreateSetupInput } from "../types";

import { FundBasicInfoEditor } from "./fund-basic-info-editor";
import { FundLedger } from "./fund-ledger";
import { FundOrders } from "./fund-orders";
import { FundOverview } from "./fund-overview";
import { FundPositions } from "./fund-positions";
import { RiskManagement } from "./risk-management";
import { ScreenerLink } from "./screener-link";
import { SetupEditor } from "./setup-editor";
import { StrategySelection } from "./strategy-selection";
import { TimeWindows } from "./time-windows";
import { TradingActivityFeed } from "./trading-activity-feed";

interface FundDetailViewProps {
  fundId: string;
}

export function FundDetailView({ fundId }: FundDetailViewProps) {
  const { details, loading, error, refresh } = useFundDetails(fundId);
  const {
    orders,
    transactions,
    transfers,
    loading: ledgerLoading,
    refresh: refreshLedger,
  } = useFundLedger(fundId);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [showSetupEditor, setShowSetupEditor] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Combined refresh function for fund data and ledger
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshLedger()]);
  }, [refresh, refreshLedger]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAll();
    }, 30000); // 30 seconds

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [refreshAll]);

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

  const { fund, setup } = details;

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
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-7 gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="screener">Screener</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <FundOverview
            fund={fund}
            orders={orders}
            transactions={transactions}
            transfers={transfers}
            onFundUpdate={refreshAll}
          />
        </TabsContent>

        <TabsContent value="configuration" className="space-y-6">
          {/* Strategy Selection Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">
              Strategy Configuration
            </h2>
            <StrategySelection
              fundId={fund.id}
              fund={fund}
              onUpdate={refreshAll}
            />
          </div>

          {/* Risk Management Section */}
          <div className="pt-6 border-t">
            <h2 className="text-xl font-semibold mb-4">Risk Management</h2>
            <RiskManagement
              fundId={fund.id}
              fund={fund}
              onUpdate={refreshAll}
            />
          </div>

          {/* Time Windows Section */}
          <div className="pt-6 border-t">
            <h2 className="text-xl font-semibold mb-4">Trading Time Windows</h2>
            <TimeWindows fundId={fund.id} fund={fund} onUpdate={refreshAll} />
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <TradingActivityFeed fundId={fundId} />
        </TabsContent>

        <TabsContent value="positions" className="space-y-6">
          <FundPositions fundId={fundId} />
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          <FundOrders fundId={fundId} />
        </TabsContent>

        <TabsContent value="screener" className="space-y-6">
          <ScreenerLink fundId={fund.id} fund={fund} onUpdate={refreshAll} />
        </TabsContent>

        <TabsContent value="ledger" className="space-y-6">
          <FundLedger
            transactions={transactions}
            transfers={transfers}
            loading={ledgerLoading}
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
