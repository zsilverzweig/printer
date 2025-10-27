/**
 * FundOverview Component
 *
 * Overview tab showing fund stats, transfer form, and transfer history.
 */

import { Badge } from "@/lib/components/ui/badge";
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
import { TransferHistory } from "./transfer-history";

interface FundOverviewProps {
  fund: Fund;
  onFundUpdate: () => void;
}

export function FundOverview({ fund, onFundUpdate }: FundOverviewProps) {
  const { transfers, loading, createTransfer } = useFundTransfers(fund.id);

  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";

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

  return (
    <div className="space-y-6">
      {/* Fund Stats */}
      <div className="grid gap-4 md:grid-cols-3">
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

      {/* Transfer Form */}
      <div className="grid gap-6 md:grid-cols-2">
        <FundTransferForm
          fundId={fund.id}
          currentBalance={fund.balance}
          onTransfer={handleTransfer}
        />

        {/* Transfer History */}
        <TransferHistory transfers={transfers} loading={loading} />
      </div>
    </div>
  );
}
