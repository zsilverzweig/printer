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

interface RecentOrdersListProps {
  orders: AlpacaOrder[];
  loading: boolean;
  accountCurrency: string;
}

export function RecentOrdersList({
  orders,
  loading,
  accountCurrency,
}: RecentOrdersListProps) {
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
        return "outline" as const;
      case "rejected":
      case "canceled":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>
            Track your most recent trading activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>
            Track your most recent trading activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              No recent orders found.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
        <CardDescription>
          Track your most recent trading activity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {orders
            .filter((order) => order && order.side)
            .map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{order.symbol}</span>
                    <Badge
                      variant={getOrderStatusVariant(order.status)}
                      className="text-xs"
                    >
                      {order.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {order.side.toUpperCase()}
                    {order.position_side ? ` (${order.position_side})` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {order.qty
                      ? formatNumber(parseFloat(order.qty), 4)
                      : order.notional
                      ? formatCurrency(
                          parseFloat(order.notional),
                          accountCurrency
                        )
                      : "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.submitted_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
