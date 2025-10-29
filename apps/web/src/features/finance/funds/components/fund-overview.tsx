/**
 * FundOverview Component
 *
 * Overview tab showing fund stats, status, and transfer form.
 */

import { Play, Square } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { useFundTransfers } from "../hooks/use-fund-transfers";
import { fundService } from "../services/fund-service";
import { Fund } from "../types";

import { FundTransferForm } from "./fund-transfer-form";

interface FundOverviewProps {
  fund: Fund;
  onFundUpdate: () => void;
}

export function FundOverview({ fund, onFundUpdate }: FundOverviewProps) {
  const { createTransfer } = useFundTransfers(fund.id);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";
  const statusColor = fund.status === "active" ? "bg-green-500" : "bg-gray-500";
  const statusLabel = fund.status === "active" ? "Active" : "Paused";

  const handleTransfer = async (
    amount: number,
    type: "deposit" | "withdrawal",
    notes?: string
  ) => {
    await createTransfer({
      fundId: fund.id,
      amount,
      transferType: type,
      notes,
    });

    // Update the fund balance
    const newBalance =
      type === "deposit" ? fund.balance + amount : fund.balance - amount;

    await fundService.updateFund(fund.id, { balance: newBalance });
    onFundUpdate();
  };

  const handleStartTrading = async () => {
    try {
      setIsStarting(true);
      await fundService.startTrading(fund.id);
      onFundUpdate();
    } catch (err) {
      console.error("Error starting trading:", err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTrading = async () => {
    try {
      setIsStopping(true);
      await fundService.stopTrading(fund.id);
      onFundUpdate();
    } catch (err) {
      console.error("Error stopping trading:", err);
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Fund Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${modeColor} text-white`}>{modeLabel}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${statusColor} text-white`}>{statusLabel}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {fund.balance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg">{fund.createdAt.toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Trading Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={handleStartTrading}
            disabled={fund.status === "active" || isStarting}
            variant={fund.status === "active" ? "outline" : "default"}
          >
            <Play className="h-4 w-4 mr-2" />
            {isStarting ? "Starting..." : "Start Trading"}
          </Button>
          <Button
            onClick={handleStopTrading}
            disabled={fund.status === "paused" || isStopping}
            variant={fund.status === "paused" ? "outline" : "destructive"}
          >
            <Square className="h-4 w-4 mr-2" />
            {isStopping ? "Stopping..." : "Stop Trading"}
          </Button>
        </CardContent>
      </Card>

      {/* Transfer Form */}
      <FundTransferForm
        fundId={fund.id}
        currentBalance={fund.balance}
        onTransfer={handleTransfer}
      />
    </div>
  );
}
