"use client";

import { Card, CardContent } from "@/lib/components/ui/card";

import { Portfolio } from "../types";

import { PortfolioCard } from "./portfolio-card";

interface PortfolioListProps {
  portfolios: Portfolio[];
  onSelectPortfolio: (portfolio: Portfolio) => void;
  onDeletePortfolio: (portfolioId: string) => void;
}

export function PortfolioList({
  portfolios,
  onSelectPortfolio,
  onDeletePortfolio,
}: PortfolioListProps) {
  if (portfolios.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-gray-500">
            <h3 className="text-lg font-medium mb-2">No portfolios found</h3>
            <p>
              Click &quot;Create Portfolio&quot; to use our AI wizard and
              generate your first portfolio from your investment thesis.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {portfolios.map((portfolio) => (
        <PortfolioCard
          key={portfolio.id}
          portfolio={portfolio}
          onSelectPortfolio={onSelectPortfolio}
          onDeletePortfolio={onDeletePortfolio}
        />
      ))}
    </div>
  );
}
