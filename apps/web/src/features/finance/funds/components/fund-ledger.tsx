/**
 * FundLedger Component
 *
 * Displays the complete ledger for a fund including:
 * - Transfers (deposits/withdrawals)
 * - Orders (pending, filled, cancelled)
 * - Transactions (completed trades with P&L)
 */

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  TrendingDown,
  TrendingUp,
  X,
  CheckCircle,
  Loader2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Badge } from "@/lib/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

import { FundOrder, FundTransaction, FundTransfer } from "../types";

interface FundLedgerProps {
  orders: FundOrder[];
  transactions: FundTransaction[];
  transfers: FundTransfer[];
  loading: boolean;
}

type LedgerItem = {
  id: string;
  type: "transfer" | "order" | "transaction";
  timestamp: Date;
  data: FundTransfer | FundOrder | FundTransaction;
};

export function FundLedger({
  orders,
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

  // Combine all items into a single timeline
  const allItems: LedgerItem[] = [
    ...transfers.map((t) => ({
      id: t.id,
      type: "transfer" as const,
      timestamp: new Date(t.timestamp),
      data: t,
    })),
    ...orders.map((o) => ({
      id: o.id,
      type: "order" as const,
      timestamp: new Date(o.submittedAt),
      data: o,
    })),
    ...transactions.map((t) => ({
      id: t.id,
      type: "transaction" as const,
      timestamp: new Date(t.timestamp),
      data: t,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const getOrderStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "filled":
        return (
          <Badge variant="default" className="text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Filled
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "canceled":
      case "failed":
        return (
          <Badge variant="destructive" className="text-xs">
            <X className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {status}
          </Badge>
        );
    }
  };

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

    if (item.type === "order") {
      const order = item.data as FundOrder;
      const isBuy = order.side === "buy";
      return (
        <div
          key={item.id}
          className="flex items-center justify-between p-4 rounded-lg border bg-card"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-blue-600" />
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {order.symbol} - {order.orderType.toUpperCase()}
                </p>
                {getOrderStatusBadge(order.status)}
                <Badge
                  variant={isBuy ? "default" : "secondary"}
                  className="text-xs"
                >
                  {isBuy ? "BUY" : "SELL"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {order.quantity} shares
                {order.filledQty && order.filledAvgPrice && (
                  <span>
                    {" "}
                    • Filled @ ${order.filledAvgPrice.toFixed(2)} = $
                    {(order.filledQty * order.filledAvgPrice).toFixed(2)}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.timestamp.toLocaleString()}
              </p>
            </div>
          </div>
          {order.filledQty && order.filledAvgPrice && (
            <div className="text-right">
              <div className="font-semibold text-lg">
                ${(order.filledQty * order.filledAvgPrice).toFixed(2)}
              </div>
            </div>
          )}
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
            isBuy ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
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
        <CardTitle>Complete Ledger</CardTitle>
        <CardDescription>
          All transfers, orders, and transactions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              All ({allItems.length})
            </TabsTrigger>
            <TabsTrigger value="transfers">
              Transfers ({transfers.length})
            </TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
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

          <TabsContent value="orders" className="space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders yet
              </div>
            ) : (
              orders
                .map((o) => ({
                  id: o.id,
                  type: "order" as const,
                  timestamp: new Date(o.submittedAt),
                  data: o,
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
