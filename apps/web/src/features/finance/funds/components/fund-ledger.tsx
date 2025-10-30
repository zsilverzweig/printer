/**
 * FundLedger Component
 *
 * Displays the complete ledger for a fund - a chronological list of money moves:
 * - Transfers (deposits/withdrawals)
 * - Transactions (completed trades with cash impact)
 */

import {
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

import { FundTransaction, FundTransfer } from "../types";

interface FundLedgerProps {
  transactions: FundTransaction[];
  transfers: FundTransfer[];
  loading: boolean;
}

type LedgerItem = {
  id: string;
  type: "transfer" | "transaction";
  timestamp: Date;
  data: FundTransfer | FundTransaction;
};

export function FundLedger({
  transactions,
  transfers,
  loading,
}: FundLedgerProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Loading ledger data...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Combine transfers and transactions into a single timeline
  const allItems: LedgerItem[] = [
    ...transfers.map((t) => ({
      id: t.id,
      type: "transfer" as const,
      timestamp: new Date(t.timestamp),
      data: t,
    })),
    ...transactions.map((t) => ({
      id: t.id,
      type: "transaction" as const,
      timestamp: new Date(t.timestamp),
      data: t,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const renderLedgerItem = (item: LedgerItem) => {
    if (item.type === "transfer") {
      const transfer = item.data as FundTransfer;
      const isDeposit = transfer.transferType === "deposit";
      return (
        <div
          key={item.id}
          className="flex items-center justify-between p-4 rounded-lg border bg-card"
        >
          <div className="flex items-center gap-3">
            {isDeposit ? (
              <ArrowDownCircle className="h-5 w-5 text-green-600" />
            ) : (
              <ArrowUpCircle className="h-5 w-5 text-red-600" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {isDeposit ? "Deposit" : "Withdrawal"}
                </p>
                <Badge variant="outline" className="text-xs">
                  Transfer
                </Badge>
              </div>
              {transfer.notes && (
                <p className="text-sm text-muted-foreground">
                  {transfer.notes}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {item.timestamp.toLocaleString()}
              </p>
            </div>
          </div>
          <div
            className={`font-semibold text-lg ${
              isDeposit ? "text-green-600" : "text-red-600"
            }`}
          >
            {isDeposit ? "+" : "-"}${transfer.amount.toFixed(2)}
          </div>
        </div>
      );
    }

    if (item.type === "transaction") {
      const txn = item.data as FundTransaction;
      const isBuy = txn.side === "buy";
      return (
        <div
          key={item.id}
          className={`flex items-center justify-between p-4 rounded-lg border ${
            isBuy
              ? "bg-green-50 dark:bg-green-950/20"
              : "bg-red-50 dark:bg-red-950/20"
          }`}
        >
          <div className="flex items-center gap-3">
            {isBuy ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{txn.symbol}</p>
                <Badge
                  variant={isBuy ? "default" : "secondary"}
                  className="text-xs"
                >
                  {isBuy ? "BUY" : "SELL"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Trade
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {txn.quantity} shares @ ${txn.price.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.timestamp.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`font-semibold text-lg ${
                isBuy ? "text-red-600" : "text-green-600"
              }`}
            >
              {isBuy ? "-" : "+"}${Math.abs(txn.totalValue).toFixed(2)}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ledger</CardTitle>
        <CardDescription>
          Complete history of money movements - transfers and trades
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All ({allItems.length})</TabsTrigger>
            <TabsTrigger value="transfers">
              Transfers ({transfers.length})
            </TabsTrigger>
            <TabsTrigger value="transactions">
              Trades ({transactions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3">
            {allItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No ledger entries yet
              </div>
            ) : (
              allItems.map(renderLedgerItem)
            )}
          </TabsContent>

          <TabsContent value="transfers" className="space-y-3">
            {transfers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No transfers yet
              </div>
            ) : (
              transfers
                .map((t) => ({
                  id: t.id,
                  type: "transfer" as const,
                  timestamp: new Date(t.timestamp),
                  data: t,
                }))
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .map(renderLedgerItem)
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No transactions yet
              </div>
            ) : (
              transactions
                .map((t) => ({
                  id: t.id,
                  type: "transaction" as const,
                  timestamp: new Date(t.timestamp),
                  data: t,
                }))
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .map(renderLedgerItem)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
