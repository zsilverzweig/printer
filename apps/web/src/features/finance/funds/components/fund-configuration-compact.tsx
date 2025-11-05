/**
 * FundConfigurationCompact Component
 *
 * Compact, efficiently laid out configuration for all fund settings
 */

"use client";

import { Fund } from "@printer/shared";

import { AIModelSelector } from "./ai-model-selector";
import { FundBasicInfoEditor } from "./fund-basic-info-editor";
import { RiskManagement } from "./risk-management";
import { ScreenerSelectorCompact } from "./screener-selector-compact";
import { StrategySelection } from "./strategy-selection";
import { TimeWindows } from "./time-windows";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

interface FundConfigurationCompactProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function FundConfigurationCompact({
  fundId,
  fund,
  onUpdate,
  onSavingChange,
}: FundConfigurationCompactProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FundBasicInfoEditor
              fund={fund}
              onUpdate={onUpdate}
              onSavingChange={onSavingChange}
              noCard
            />
          </CardContent>
        </Card>

        {/* Strategy & AI Model */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Strategy & AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StrategySelection
              fundId={fundId}
              fund={fund}
              onUpdate={onUpdate}
              onSavingChange={onSavingChange}
            />
            <div className="pt-3 border-t">
              <AIModelSelector
                fund={fund}
                onUpdate={onUpdate}
                onSavingChange={onSavingChange}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Screener */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Screening Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <ScreenerSelectorCompact
              fundId={fundId}
              fund={fund}
              onUpdate={onUpdate}
              onSavingChange={onSavingChange}
            />
          </CardContent>
        </Card>

        {/* Time Windows */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trading Windows</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeWindows
              fundId={fundId}
              fund={fund}
              onUpdate={onUpdate}
              onSavingChange={onSavingChange}
            />
          </CardContent>
        </Card>
      </div>

      {/* Risk Management - Full Width */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Risk Management</CardTitle>
        </CardHeader>
        <CardContent>
          <RiskManagement
            fundId={fundId}
            fund={fund}
            onUpdate={onUpdate}
            onSavingChange={onSavingChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
