"use client";

import React, { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { ConfirmationDialog } from "@/lib/components/ui/confirmation-dialog";
import { Input } from "@/lib/components/ui/input";
import { Modal } from "@/lib/components/ui/modal";
import { log } from "@/lib/utils/logger";

import { Portfolio, PortfolioPosition, UpdatePortfolioRequest } from "../types";

interface PortfolioDetailsDialogProps {
  portfolio: Portfolio | null;
  onClose: () => void;
  onUpdatePortfolio: (
    portfolioId: string,
    updates: UpdatePortfolioRequest
  ) => Promise<void>;
  onDeletePortfolio: (portfolioId: string) => void;
}

export function PortfolioDetailsDialog({
  portfolio,
  onClose,
  onUpdatePortfolio,
  onDeletePortfolio,
}: PortfolioDetailsDialogProps) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UpdatePortfolioRequest>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  React.useEffect(() => {
    if (portfolio) {
      setFormData({
        name: portfolio.name,
        description: portfolio.description,
        thesis: portfolio.thesis,
      });
    }
  }, [portfolio]);

  const handleSave = async () => {
    if (!portfolio) return;

    try {
      await onUpdatePortfolio(portfolio.id, formData);
      setEditing(false);
    } catch (error) {
      log.error("Failed to update portfolio", error, "PortfolioDetailsDialog");
    }
  };

  const handleDeleteClick = () => {
    if (!portfolio) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!portfolio) return;

    setIsDeleting(true);
    try {
      await onDeletePortfolio(portfolio.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      log.error("Failed to delete portfolio", error, "PortfolioDetailsDialog");
      // Error handling is done by the parent component
    } finally {
      setIsDeleting(false);
    }
  };

  if (!portfolio) return null;

  const portfolioMetadata = (portfolio.metadata || {}) as {
    portfolioSummary?: string;
    riskManagement?: string;
  };

  return (
    <>
      <Modal
        open={Boolean(portfolio)}
        onOpenChange={(open) => {
          console.log("PortfolioDetailsDialog onOpenChange called with:", open);
          if (!open) {
            console.log("PortfolioDetailsDialog calling onClose");
            onClose();
          }
        }}
        title="Portfolio Details"
        size="2xl"
        className="max-w-6xl"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                console.log("PortfolioDetailsDialog Close button clicked");
                onClose();
              }}
            >
              Close
            </Button>
            <Button variant="destructive" onClick={handleDeleteClick}>
              Delete Portfolio
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Portfolio Information</CardTitle>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? "Cancel" : "Edit"}
                  </Button>
                  {editing && (
                    <Button size="sm" onClick={handleSave}>
                      Save
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  {editing ? (
                    <Input
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-foreground">{portfolio.name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Status
                  </label>
                  <Badge variant={portfolio.isActive ? "default" : "secondary"}>
                    {portfolio.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                {editing ? (
                  <Input
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="text-foreground">{portfolio.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Created
                  </label>
                  <p className="text-foreground">
                    {new Date(portfolio.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Last Updated
                  </label>
                  <p className="text-foreground">
                    {new Date(portfolio.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investment Thesis */}
          <Card>
            <CardHeader>
              <CardTitle>Investment Thesis</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <textarea
                  value={formData.thesis || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, thesis: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={6}
                />
              ) : (
                <div className="bg-muted p-4 rounded-md">
                  <p className="whitespace-pre-wrap text-foreground">
                    {portfolio.thesis}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio Positions */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Positions</CardTitle>
              <CardDescription>
                AI-generated trade recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {portfolio.positions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No positions have been generated yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  {portfolioMetadata.portfolioSummary && (
                    <div className="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm">
                      <p className="font-medium text-foreground">
                        Portfolio Summary
                      </p>
                      <p className="text-muted-foreground">
                        {portfolioMetadata.portfolioSummary}
                      </p>
                    </div>
                  )}
                  {portfolioMetadata.riskManagement && (
                    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">Risk Guidance</p>
                      <p>{portfolioMetadata.riskManagement}</p>
                    </div>
                  )}
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Symbol</th>
                        <th className="py-2 pr-4 font-medium">Name</th>
                        <th className="py-2 pr-4 font-medium">Side</th>
                        <th className="py-2 pr-4 font-medium">Weight</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium">Price Target</th>
                        <th className="py-2 pr-4 font-medium">Catalyst</th>
                        <th className="py-2 pr-4 font-medium">Rationale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {portfolio.positions.map(
                        (position: PortfolioPosition) => (
                          <tr key={position.id} className="align-top">
                            <td className="py-3 pr-4 font-semibold text-foreground">
                              {position.symbol}
                            </td>
                            <td className="py-3 pr-4">{position.name}</td>
                            <td className="py-3 pr-4 capitalize">
                              {position.side}
                            </td>
                            <td className="py-3 pr-4">
                              {(position.weight * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 pr-4 capitalize">
                              {position.status.replace("_", " ")}
                            </td>
                            <td className="py-3 pr-4">
                              {position.priceTarget > 0
                                ? `$${position.priceTarget.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}`
                                : "—"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {position.catalyst || "—"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {position.rationale}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Portfolio"
        description={`Are you sure you want to delete "${portfolio.name}"? This will permanently remove the portfolio and all its data.`}
        variant="destructive"
        isLoading={isDeleting}
        loadingText="Deleting..."
        confirmText="Delete Portfolio"
        cancelText="Cancel"
        size="sm"
      />
    </>
  );
}
