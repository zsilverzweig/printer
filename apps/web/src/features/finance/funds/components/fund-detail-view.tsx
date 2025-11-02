/**
 * FundDetailView Component
 *
 * Main component for the fund detail page with tabbed interface.
 */

"use client";

import { ArrowLeft, Bug } from "lucide-react";
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
import { useFundRealtime } from "../hooks/use-fund-realtime";
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
    orders: fallbackOrders,
    transactions: fallbackTransactions,
    transfers: fallbackTransfers,
    positions: fallbackPositions,
    positionsSummary: fallbackPositionsSummary,
    loading: ledgerLoading,
    refresh: refreshLedger,
  } = useFundLedger(fundId);

  // Real-time WebSocket connection
  const {
    data: realtimeData,
    isConnected,
    isConnecting,
    error: wsError,
    reconnect,
  } = useFundRealtime(fundId);

  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [showSetupEditor, setShowSetupEditor] = useState(false);
  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "overview" });

  // Combined refresh function for fund data and ledger
  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshLedger()]);
  }, [refresh, refreshLedger]);

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

  // Use real-time data if connected, fallback to fetched data
  // This is safe because we've already checked that details exists above
  const fund = realtimeData.fund || details.fund;
  const orders =
    realtimeData.orders.length > 0 ? realtimeData.orders : fallbackOrders;
  const transactions =
    realtimeData.transactions.length > 0
      ? realtimeData.transactions
      : fallbackTransactions;
  const transfers =
    realtimeData.transfers.length > 0
      ? realtimeData.transfers
      : fallbackTransfers;

  // Use realtime positions (updated every 30s via WebSocket!)
  const positions =
    realtimeData.positions.length > 0
      ? realtimeData.positions
      : fallbackPositions;
  const positionsSummary =
    realtimeData.positions.length > 0
      ? realtimeData.positionsSummary
      : fallbackPositionsSummary;

  const handleSaveSetup = async (input: CreateSetupInput) => {
    const newSetup = await setupService.createSetup(input);
    setSelectedSetupId(newSetup.id);
    setShowSetupEditor(false);
  };

  const copyDebugInfoToClipboard = async () => {
    const debugInfo = {
      fund,
      fundKeys: fund ? Object.keys(fund) : [],
      realtimeData: {
        fund: realtimeData.fund ? "Present" : "Null/Undefined",
        fundKeys: realtimeData.fund ? Object.keys(realtimeData.fund) : [],
        ordersCount: realtimeData.orders.length,
        transactionsCount: realtimeData.transactions.length,
        transfersCount: realtimeData.transfers.length,
      },
      details: {
        fund: details?.fund ? "Present" : "Null/Undefined",
        fundKeys: details?.fund ? Object.keys(details.fund) : [],
        setup: details?.setup ? "Present" : "Null/Undefined",
      },
      connection: {
        isConnected,
        isConnecting,
        error: wsError,
      },
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

        {/* Debug button with connection status color */}
        <button
          onClick={copyDebugInfoToClipboard}
          className={`p-1.5 rounded-md transition-colors ${
            isConnected && !isConnecting
              ? "text-green-600 hover:bg-green-50"
              : isConnecting
              ? "text-gray-400 hover:bg-gray-50"
              : "text-orange-600 hover:bg-orange-50"
          }`}
          title={
            isConnected && !isConnecting
              ? "Live - Click to copy debug info"
              : isConnecting
              ? "Connecting... Click to copy debug info"
              : "Disconnected - Click to copy debug info"
          }
        >
          <Bug className="h-4 w-4" />
        </button>
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
            positions={positions}
            positionsSummary={positionsSummary}
            onFundUpdate={refreshAll}
          />
        </TabsContent>

        <TabsContent value="configuration" className="space-y-6">
          {/* Basic Info Section */}
          <FundBasicInfoEditor fund={fund} onUpdate={refreshAll} />

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
