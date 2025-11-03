/**
 * FundManagement Component
 *
 * Main component for the funds management page.
 */

"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

import { useFunds } from "../hooks/use-funds";

import { AlpacaBalanceSummary } from "./alpaca-balance-summary";
import { CreateFundDialog } from "./create-fund-dialog";
import { FundPerformanceOverview } from "./fund-performance-overview";
import { FundsTable } from "./funds-table";

export function FundManagement() {
  const { funds, loading, error, createFund, refresh } = useFunds();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "overview" });

  const simFunds = funds.filter((f) => f.mode === "sim");
  const realFunds = funds.filter((f) => f.mode === "real");

  const totalBalance = funds.reduce((sum, fund) => sum + fund.balance, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading funds...</p>
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
              <h3 className="font-semibold mb-2">Error Loading Funds</h3>
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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              Fund Management
            </h1>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Create Fund
            </button>
          </div>
          <p className="text-muted-foreground mt-2">
            Manage trading funds with automated strategies
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Alpaca Account Summary */}
          <AlpacaBalanceSummary />

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Funds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{funds.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Cash Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  $
                  {totalBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  See individual fund cards for full AUM
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    Simulation Funds
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{simFunds.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    Real Money Funds
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{realFunds.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Fund Table */}
          <FundsTable funds={funds} onRefresh={refresh} />
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <FundPerformanceOverview
            funds={funds}
            isActive={activeTab === "performance"}
          />
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <CreateFundDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={createFund}
      />
    </div>
  );
}
