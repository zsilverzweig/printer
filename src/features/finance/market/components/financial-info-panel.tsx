"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Skeleton } from "@/lib/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import type { FinancialData, TickerDetails } from "@/lib/types/ticker";
import { useEffect, useState } from "react";

interface FinancialInfoPanelProps {
  ticker: string;
  onDataLoad?: (data: {
    overview: Record<string, unknown>;
    financials: Record<string, unknown>;
  }) => void;
}

/**
 * Format large numbers (e.g., market cap, revenue) to human-readable format
 */
function formatLargeNumber(value: number | undefined): string {
  if (!value) return "N/A";

  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  } else if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }

  return `$${value.toFixed(2)}`;
}

/**
 * Format date string to readable format
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Info row component for key-value pairs
 */
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-2 border-b border-border/40 last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

/**
 * Financial info panel that displays company details and financial data
 */
export function FinancialInfoPanel({
  ticker,
  onDataLoad,
}: FinancialInfoPanelProps) {
  const [details, setDetails] = useState<TickerDetails | null>(null);
  const [financials, setFinancials] = useState<FinancialData | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [errorFinancials, setErrorFinancials] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    // Reset state when ticker changes
    setDetails(null);
    setFinancials(null);
    setIsLoadingDetails(true);
    setIsLoadingFinancials(true);
    setErrorDetails(null);
    setErrorFinancials(null);

    // Fetch ticker details
    fetch(`${apiUrl}/ticker-details/${ticker}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch details: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setDetails(data);
        setIsLoadingDetails(false);
      })
      .catch((err) => {
        console.error("Error fetching ticker details:", err);
        setErrorDetails(err.message);
        setIsLoadingDetails(false);
      });

    // Fetch financials
    fetch(`${apiUrl}/financials/${ticker}?limit=4`)
      .then((res) => {
        if (!res.ok)
          throw new Error(`Failed to fetch financials: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setFinancials(data);
        setIsLoadingFinancials(false);
      })
      .catch((err) => {
        console.error("Error fetching financials:", err);
        setErrorFinancials(err.message);
        setIsLoadingFinancials(false);
      });
  }, [ticker, apiUrl]);

  // Get latest financial data
  const latestFinancial = financials?.results?.[0];
  const incomeStatement = latestFinancial?.financials?.income_statement;
  const balanceSheet = latestFinancial?.financials?.balance_sheet;
  const cashFlow = latestFinancial?.financials?.cash_flow_statement;

  // Notify parent when data is loaded
  useEffect(() => {
    if (details && financials && onDataLoad) {
      onDataLoad({
        overview: {
          market_cap: details.market_cap,
          primary_exchange: details.primary_exchange,
          type: details.type,
          currency_name: details.currency_name,
          share_class_shares_outstanding:
            details.share_class_shares_outstanding,
          list_date: details.list_date,
          total_employees: details.total_employees,
        },
        financials: {
          revenue: incomeStatement?.revenues?.value,
          gross_profit: incomeStatement?.gross_profit?.value,
          operating_income: incomeStatement?.operating_income?.value,
          net_income: incomeStatement?.net_income_loss?.value,
          eps: incomeStatement?.diluted_earnings_per_share?.value,
          total_assets: balanceSheet?.assets?.value,
          total_liabilities: balanceSheet?.liabilities?.value,
          equity: balanceSheet?.equity?.value,
        },
      });
    }
  }, [details, financials, onDataLoad]);

  return (
    <Card className="w-full flex-shrink-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {ticker}
          {details?.name && (
            <span className="text-sm font-normal text-muted-foreground">
              — {details.name}
            </span>
          )}
        </CardTitle>
        {details?.description && (
          <CardDescription className="line-clamp-1 text-xs">
            {details.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {isLoadingDetails ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : errorDetails ? (
              <div className="text-sm text-destructive">{errorDetails}</div>
            ) : (
              <div className="space-y-1">
                <InfoRow
                  label="Market Cap"
                  value={formatLargeNumber(details?.market_cap)}
                />
                <InfoRow
                  label="Exchange"
                  value={details?.primary_exchange || "N/A"}
                />
                <InfoRow label="Type" value={details?.type || "N/A"} />
                <InfoRow
                  label="Currency"
                  value={details?.currency_name || "N/A"}
                />
                <InfoRow
                  label="Shares Outstanding"
                  value={
                    details?.share_class_shares_outstanding
                      ? formatLargeNumber(
                          details.share_class_shares_outstanding
                        )
                      : "N/A"
                  }
                />
                <InfoRow
                  label="List Date"
                  value={formatDate(details?.list_date)}
                />
                {details?.total_employees && (
                  <InfoRow
                    label="Employees"
                    value={details.total_employees.toLocaleString()}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="financials" className="space-y-4 mt-4">
            {isLoadingFinancials ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : errorFinancials ? (
              <div className="text-sm text-destructive">{errorFinancials}</div>
            ) : !latestFinancial ? (
              <div className="text-sm text-muted-foreground">
                No financial data available
              </div>
            ) : (
              <div>
                <div className="text-sm text-muted-foreground mb-3">
                  Period: {latestFinancial.timeframe} (
                  {formatDate(latestFinancial.start_date)} -{" "}
                  {formatDate(latestFinancial.end_date)})
                </div>
                <div className="space-y-1">
                  {incomeStatement?.revenues?.value && (
                    <InfoRow
                      label="Revenue"
                      value={formatLargeNumber(incomeStatement.revenues.value)}
                    />
                  )}
                  {incomeStatement?.gross_profit?.value && (
                    <InfoRow
                      label="Gross Profit"
                      value={formatLargeNumber(
                        incomeStatement.gross_profit.value
                      )}
                    />
                  )}
                  {incomeStatement?.operating_income?.value && (
                    <InfoRow
                      label="Operating Income"
                      value={formatLargeNumber(
                        incomeStatement.operating_income.value
                      )}
                    />
                  )}
                  {incomeStatement?.net_income_loss?.value && (
                    <InfoRow
                      label="Net Income"
                      value={formatLargeNumber(
                        incomeStatement.net_income_loss.value
                      )}
                    />
                  )}
                  {incomeStatement?.diluted_earnings_per_share?.value && (
                    <InfoRow
                      label="EPS (Diluted)"
                      value={`$${incomeStatement.diluted_earnings_per_share.value.toFixed(
                        2
                      )}`}
                    />
                  )}
                  {balanceSheet?.assets?.value && (
                    <InfoRow
                      label="Total Assets"
                      value={formatLargeNumber(balanceSheet.assets.value)}
                    />
                  )}
                  {balanceSheet?.liabilities?.value && (
                    <InfoRow
                      label="Total Liabilities"
                      value={formatLargeNumber(balanceSheet.liabilities.value)}
                    />
                  )}
                  {balanceSheet?.equity?.value && (
                    <InfoRow
                      label="Equity"
                      value={formatLargeNumber(balanceSheet.equity.value)}
                    />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-4 mt-4">
            {isLoadingDetails ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : errorDetails ? (
              <div className="text-sm text-destructive">{errorDetails}</div>
            ) : (
              <div className="space-y-1">
                {details?.sic_description && (
                  <InfoRow label="Industry" value={details.sic_description} />
                )}
                {details?.sic_code && (
                  <InfoRow label="SIC Code" value={details.sic_code} />
                )}
                {details?.cik && <InfoRow label="CIK" value={details.cik} />}
                {details?.homepage_url && (
                  <InfoRow
                    label="Website"
                    value={
                      <a
                        href={details.homepage_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {details.homepage_url.replace(
                          /^https?:\/\/(www\.)?/,
                          ""
                        )}
                      </a>
                    }
                  />
                )}
                {details?.phone_number && (
                  <InfoRow label="Phone" value={details.phone_number} />
                )}
                {details?.address && (
                  <InfoRow
                    label="Address"
                    value={`${details.address.address1 || ""}, ${
                      details.address.city || ""
                    }, ${details.address.state || ""} ${
                      details.address.postal_code || ""
                    }`.trim()}
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
