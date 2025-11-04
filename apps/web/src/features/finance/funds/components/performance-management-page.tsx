/**
 * Performance Management Page
 *
 * Main dashboard integrating all performance analytics components.
 * Tab-based layout for trade journal, metrics, patterns, and comparative analysis.
 */

"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

import { Fund } from "../types";

import { ComparativePerformance } from "./comparative-performance";
import { EquityCurveChart } from "./equity-curve-chart";
import { PatternSuccessMatrix } from "./pattern-success-matrix";
import { PerformanceMetricsDashboard } from "./performance-metrics-dashboard";
import { TimePerformanceHeatmap } from "./time-performance-heatmap";
import { TradeJournal } from "./trade-journal";

interface PerformanceManagementPageProps {
  funds: Fund[];
}

export function PerformanceManagementPage({
  funds,
}: PerformanceManagementPageProps) {
  const [selectedFundId, setSelectedFundId] = useState<string | "all">(
    funds.length > 0 ? funds[0].id : "all"
  );

  const activeFunds = funds.filter((f) => !f.archived);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Performance Management</h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive trade analytics and strategy effectiveness
          </p>
        </div>

        {/* Fund Selector */}
        <Select
          value={selectedFundId}
          onValueChange={(value) => setSelectedFundId(value)}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select fund" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funds (Comparative)</SelectItem>
            {activeFunds.map((fund) => (
              <SelectItem key={fund.id} value={fund.id}>
                {fund.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main Content */}
      {selectedFundId === "all" ? (
        // Comparative view for all funds
        <ComparativePerformance fundIds={activeFunds.map((f) => f.id)} />
      ) : (
        // Single fund detailed view
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="journal">Trade Journal</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
            <TabsTrigger value="timing">Timing</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <PerformanceMetricsDashboard fundId={selectedFundId} />
            <EquityCurveChart fundId={selectedFundId} height={400} />
          </TabsContent>

          {/* Trade Journal Tab */}
          <TabsContent value="journal">
            <TradeJournal fundId={selectedFundId} />
          </TabsContent>

          {/* Patterns Tab */}
          <TabsContent value="patterns" className="space-y-4">
            <PatternSuccessMatrix fundId={selectedFundId} minSampleSize={3} />
          </TabsContent>

          {/* Timing Tab */}
          <TabsContent value="timing">
            <TimePerformanceHeatmap fundId={selectedFundId} />
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Analytics</CardTitle>
                <CardDescription>
                  Coming soon: Drawdown analysis, streak visualization,
                  distribution charts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground text-center py-8">
                  Additional visualizations will be added here
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
