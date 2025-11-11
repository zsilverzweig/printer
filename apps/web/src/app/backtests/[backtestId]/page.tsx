import { notFound } from "next/navigation";

import { BacktestDetailsPage } from "@/features/research/backtests";

interface BacktestDetailsRouteProps {
  params: {
    backtestId?: string;
  };
}

export default function BacktestDetailsRoute({
  params,
}: BacktestDetailsRouteProps) {
  const backtestId = params.backtestId
    ? decodeURIComponent(params.backtestId)
    : null;

  if (!backtestId) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <BacktestDetailsPage backtestId={backtestId} />
    </div>
  );
}


