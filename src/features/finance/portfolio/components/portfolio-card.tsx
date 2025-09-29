"use client";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { Portfolio } from "../types";

interface PortfolioCardProps {
  portfolio: Portfolio;
  onSelectPortfolio: (portfolio: Portfolio) => void;
  onDeletePortfolio: (portfolioId: string) => void;
}

export function PortfolioCard({
  portfolio,
  onSelectPortfolio,
  onDeletePortfolio,
}: PortfolioCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{portfolio.name}</CardTitle>
            <CardDescription className="mt-1 line-clamp-3">
              {portfolio.thesis}{" "}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Status Section for In-Progress Portfolios */}
          {portfolio.status && portfolio.status !== "completed" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Creating Portfolio
                  </p>
                  <p className="text-xs text-blue-700">{portfolio.status}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Positions
            </label>
            {portfolio.positions.length === 0 ? (
              <span className="text-sm text-gray-500">
                {portfolio.status && portfolio.status !== "completed"
                  ? "Positions will appear as portfolio is created..."
                  : "No positions generated yet"}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {portfolio.positions.slice(0, 3).map((position) => (
                  <Badge
                    key={position.id}
                    variant="secondary"
                    className="text-xs"
                  >
                    {position.symbol} · {position.side.toUpperCase()} ·{" "}
                    {position.status.replace("_", " ")}
                  </Badge>
                ))}
                {portfolio.positions.length > 3 && (
                  <span className="text-xs text-gray-500">
                    +{portfolio.positions.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Created:</span>
              <span className="font-medium">
                {new Date(portfolio.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Last Updated:</span>
              <span className="font-medium">
                {new Date(portfolio.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectPortfolio(portfolio)}
              className="flex-1"
            >
              View Details
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeletePortfolio(portfolio.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
