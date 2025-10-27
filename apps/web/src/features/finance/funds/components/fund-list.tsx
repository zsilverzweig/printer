/**
 * FundList Component
 *
 * Displays a list/grid of funds.
 */

import { Fund } from "../types";
import { FundCard } from "./fund-card";

interface FundListProps {
  funds: Fund[];
}

export function FundList({ funds }: FundListProps) {
  if (funds.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No funds yet. Create your first fund to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {funds.map((fund) => (
        <FundCard key={fund.id} fund={fund} />
      ))}
    </div>
  );
}
