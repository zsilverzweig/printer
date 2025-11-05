/**
 * FundOrders Component
 *
 * Displays orders for a fund with Alpaca validation and cleanup options.
 */

"use client";

import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/lib/components/ui/alert-dialog";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

interface Order {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  order_type: string;
  submitted_at: string;
  filled_at: string | null;
  filled_qty: number | null;
  filled_avg_price: number | null;
  alpaca_order_id: string;
}

interface ValidationResult {
  order_id: string;
  is_synced: boolean | null;
  is_orphaned: boolean;
  reason?: string;
  alpaca_status?: string;
  db_status?: string;
  status_matches?: boolean;
  trade_recreated?: boolean;
  trade_recreation_error?: string;
}

interface FundOrdersProps {
  fundId: string;
}

export function FundOrders({ fundId }: FundOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Map<string, ValidationResult>
  >(new Map());
  const [validating, setValidating] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/orders?limit=100`,
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error("Failed to fetch orders");
      const data = await response.json();

      // Ensure data is an array
      setOrders(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to fetch orders");
      }
      setOrders([]); // Set empty array on error to show empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [fundId]);

  const validateOrder = async (orderId: string) => {
    try {
      setValidating((prev) => new Set(prev).add(orderId));
      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/orders/${orderId}/validate`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Failed to validate order");
      const result: ValidationResult = await response.json();
      setValidationResults((prev) => new Map(prev).set(orderId, result));

      // Refresh orders if trade was recreated
      if (result.trade_recreated) {
        await fetchOrders();
      }
    } catch (err) {
      console.error("Error validating order:", err);
    } finally {
      setValidating((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      setDeleting(true);
      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/orders/${orderId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to delete order");
      }
      // Refresh orders list
      await fetchOrders();
      setDeleteConfirm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete order");
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      filled: "default",
      pending: "secondary",
      canceled: "outline",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getValidationIcon = (orderId: string) => {
    const result = validationResults.get(orderId);
    if (!result) return null;

    // Show trade recreation status if present
    const tradeStatus = result.trade_recreated ? (
      <span className="text-xs text-green-600 font-semibold">
        ✓ Trade recreated
      </span>
    ) : result.trade_recreation_error ? (
      <span className="text-xs text-yellow-600">
        ⚠ {result.trade_recreation_error}
      </span>
    ) : null;

    if (result.is_orphaned) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Orphaned: {result.reason}</span>
          </div>
          {tradeStatus}
        </div>
      );
    }

    if (result.is_synced === false) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{result.reason}</span>
          </div>
          {tradeStatus}
        </div>
      );
    }

    if (result.is_synced === true) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Synced</span>
            {!result.status_matches && (
              <span className="text-xs text-yellow-600">
                (DB: {result.db_status} ≠ Alpaca: {result.alpaca_status})
              </span>
            )}
          </div>
          {tradeStatus}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-gray-600">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{result.reason}</span>
        </div>
        {tradeStatus}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading orders...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Orders</p>
            <p className="text-sm">{error}</p>
            <Button onClick={fetchOrders} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Orders</CardTitle>
              <CardDescription>
                Order history with Alpaca validation
              </CardDescription>
            </div>
            <Button onClick={fetchOrders} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Filled</TableHead>
                    <TableHead>Alpaca ID</TableHead>
                    <TableHead>Validation</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.symbol}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            order.side === "buy" ? "default" : "secondary"
                          }
                        >
                          {order.side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{order.quantity}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(order.submitted_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {order.filled_at
                          ? new Date(order.filled_at).toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {order.alpaca_order_id ? (
                          <span className="text-muted-foreground">
                            {order.alpaca_order_id.slice(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-red-600">Missing</span>
                        )}
                      </TableCell>
                      <TableCell>{getValidationIcon(order.id)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => validateOrder(order.id)}
                            variant="outline"
                            size="sm"
                            disabled={validating.has(order.id)}
                          >
                            {validating.has(order.id) ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              "Validate"
                            )}
                          </Button>
                          {(order.status === "failed" ||
                            order.status === "canceled" ||
                            !order.alpaca_order_id ||
                            validationResults.get(order.id)?.is_orphaned) && (
                            <Button
                              onClick={() => setDeleteConfirm(order.id)}
                              variant="ghost"
                              size="sm"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be
              undone. This should only be used for failed, canceled, or orphaned
              orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteOrder(deleteConfirm)}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
