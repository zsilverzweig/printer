/**
 * FundList Component
 *
 * Displays a list/grid of funds.
 */

import { Fund } from "../types";
import { FundsTable, buildLifecycleSummaries } from "./funds-table";

interface FundListProps {
  funds: Fund[];
}

export function FundList({ funds }: FundListProps) {
  const lifecycleSummaries = buildLifecycleSummaries(funds);
  return (
    <FundsTable funds={funds} lifecycleSummaries={lifecycleSummaries} />
  );
}
