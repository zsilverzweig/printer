/**
 * FundDetailView Component
 *
 * Main component for the fund detail page with tabbed interface.
 */

"use client";

import { ArrowLeft, Bug, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/lib/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

import { useFundDetails } from "../hooks/use-fund-details";
import { useFundLedger } from "../hooks/use-fund-ledger";
import { setupService } from "../services/setup-service";
import { CreateSetupInput } from "../types";

import { ActivityFeed } from "./activity-feed";
import { FundConfigurationCompact } from "./fund-configuration-compact";
import { FundLedger } from "./fund-ledger";
import { FundOrders } from "./fund-orders";
import { FundOverview } from "./fund-overview";
import { FundPositions } from "./fund-positions";
import { FundTrades } from "./fund-trades";
import { FundManualTrading } from "./fund-manual-trading";
import { SetupEditor } from "./setup-editor";
import { TickerLifecycleView } from "./ticker-lifecycle-view";

interface FundDetailViewProps {
  fundId: string;
}

export function FundDetailView({ fundId }: FundDetailViewProps) {
  const { details, loading, error, refresh } = useFundDetails(fundId);
  const {
    orders: fallbackOrders,
    transactions: fallbackTransactions,
    transfers: fallbackTransfers,
    positions: fallbackPositions,
    positionsSummary: fallbackPositionsSummary,
    loading: ledgerLoading,
    refresh: refreshLedger,
  } = useFundLedger(fundId);

  // Real-time WebSocket connection removed to prevent auto-refresh

  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [showSetupEditor, setShowSetupEditor] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "overview" });

  // Combined refresh function for fund data and ledger
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshLedger()]);
  }, [refresh, refreshLedger]);

  const handleSavingChange = useCallback((saving: boolean) => {
    setSavingCount((count) => {
      const next = saving ? count + 1 : count - 1;
      return next < 0 ? 0 : next;
    });
    if (!saving) {
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    }
  }, []);

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

  const { setup } = details;

  // Use fetched data only (no auto-refresh)
  const fund = details.fund;
  const orders = fallbackOrders;
  const transactions = fallbackTransactions;
  const transfers = fallbackTransfers;
  const positions = fallbackPositions;
  const positionsSummary = fallbackPositionsSummary;

  const handleSaveSetup = async (input: CreateSetupInput) => {
    const newSetup = await setupService.createSetup(input);
    setSelectedSetupId(newSetup.id);
    setShowSetupEditor(false);
  };

  const copyDebugInfoToClipboard = async () => {
    const debugInfo = {
      fund,
      fundKeys: fund ? Object.keys(fund) : [],
      details: {
        fund: details?.fund ? "Present" : "Null/Undefined",
        fundKeys: details?.fund ? Object.keys(details.fund) : [],
        setup: details?.setup ? "Present" : "Null/Undefined",
      },
      connection: "disabled",
    };

    await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));

    toast.success("Debug info copied", {
      description: "Debug information has been copied to clipboard",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/funds">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{fund?.name || "Loading..."}</h1>
            {fund?.description && (
              <p className="text-muted-foreground mt-1">{fund.description}</p>
            )}
          </div>
        </div>

        {/* Saving indicator + Debug button */}
        <div className="flex items-center gap-2">
          {savingCount > 0 ? (
            <span className="text-xs text-muted-foreground">Saving...</span>
          ) : justSaved ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" /> Saved
            </span>
          ) : null}

          <button
            onClick={copyDebugInfoToClipboard}
            className="p-1.5 rounded-md transition-colors text-muted-foreground hover:bg-muted/20"
            title="Copy debug info"
          >
            <Bug className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-9 gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="ticker-lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <FundOverview
            fund={fund}
            orders={orders}
            transactions={transactions}
            transfers={transfers}
            positions={positions}
            positionsSummary={positionsSummary}
            onFundUpdate={refreshAll}
          />
        </TabsContent>

        <TabsContent value="configuration" className="space-y-4">
          <FundConfigurationCompact
            fundId={fund.id}
            fund={fund}
            onUpdate={refreshAll}
            onSavingChange={handleSavingChange}
          />
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <ActivityFeed fundId={fundId} />
        </TabsContent>

        <TabsContent value="positions" className="space-y-6">
          <FundPositions fundId={fundId} />
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          <FundOrders fundId={fundId} />
        </TabsContent>

        <TabsContent value="trading" className="space-y-6">
          <FundManualTrading
            fundId={fundId}
            fund={fund}
            positions={positions}
            onOrderPlaced={refreshAll}
          />
        </TabsContent>

        <TabsContent value="trades" className="space-y-6">
          <FundTrades fundId={fundId} />
        </TabsContent>

        <TabsContent value="ticker-lifecycle" className="space-y-6">
          <TickerLifecycleView fundId={fundId} />
        </TabsContent>

        <TabsContent value="ledger" className="space-y-6">
          <FundLedger
            fundId={fund.id}
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
