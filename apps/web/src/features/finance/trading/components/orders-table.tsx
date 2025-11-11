"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { AlpacaOrder } from "@/lib/types/alpaca";

interface OrdersTableProps {
  orders: AlpacaOrder[];
  loading: boolean;
  accountCurrency: string;
}

export function OrdersTable({
  orders,
  loading,
  accountCurrency,
}: OrdersTableProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const getOrderStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "filled":
        return "default" as const;
      case "partially_filled":
        return "secondary" as const;
      case "pending_new":
      case "accepted":
      case "new":
        return "outline" as const;
      case "rejected":
      case "canceled":
      case "expired":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            View all your trading orders and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            View all your trading orders and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              No orders found. Place your first trade to see it here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order History</CardTitle>
        <CardDescription>
          View all your trading orders and their status ({orders.length} total)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                  Symbol
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                  Side
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                  Type
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">
                  Qty
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">
                  Filled Qty
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">
                  Avg Price
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                  TIF
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody>
              {orders
                .filter((order) => order && order.side)
                .map((order) => (
                  <tr key={order.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">{order.symbol}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`text-sm font-medium ${
                          order.side?.toLowerCase() === "buy"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {order.side?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-sm capitalize">
                      {order.type || "market"}
                    </td>
                    <td className="py-3 px-2 text-right text-sm">
                      {order.qty
                        ? formatNumber(parseFloat(order.qty), 4)
                        : order.notional
                        ? formatCurrency(
                            parseFloat(order.notional),
                            accountCurrency
                          )
                        : "-"}
                    </td>
                    <td className="py-3 px-2 text-right text-sm">
                      {order.filled_qty
                        ? formatNumber(parseFloat(order.filled_qty), 4)
                        : "0"}
                    </td>
                    <td className="py-3 px-2 text-right text-sm">
                      {order.filled_avg_price
                        ? formatCurrency(
                            parseFloat(order.filled_avg_price),
                            accountCurrency
                          )
                        : "-"}
                    </td>
                    <td className="py-3 px-2 text-sm uppercase">
                      {order.time_in_force || "DAY"}
                    </td>
                    <td className="py-3 px-2">
                      <Badge
                        variant={getOrderStatusVariant(order.status)}
                        className="text-xs"
                      >
                        {order.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-sm text-muted-foreground">
                      {formatDateTime(order.submitted_at)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

