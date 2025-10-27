/**
 * TransferHistory Component
 *
 * Displays the transfer history for a fund.
 */

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { FundTransfer } from "../types";

interface TransferHistoryProps {
  transfers: FundTransfer[];
  loading: boolean;
}

export function TransferHistory({ transfers, loading }: TransferHistoryProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transfer History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Loading transfers...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer History</CardTitle>
        <CardDescription>Recent deposits and withdrawals</CardDescription>
      </CardHeader>
      <CardContent>
        {transfers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No transfers yet
          </div>
        ) : (
          <div className="space-y-2">
            {transfers.map((transfer) => {
              const isDeposit = transfer.transferType === "deposit";
              return (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {isDeposit ? (
                      <ArrowDownCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">
                        {isDeposit ? "Deposit" : "Withdrawal"}
                      </p>
                      {transfer.notes && (
                        <p className="text-sm text-muted-foreground">
                          {transfer.notes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {transfer.timestamp.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`font-semibold ${
                      isDeposit ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isDeposit ? "+" : "-"}${transfer.amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
