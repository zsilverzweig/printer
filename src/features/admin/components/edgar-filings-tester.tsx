"use client";

import { useMemo, useState } from "react";

import type {
  EdgarFilingSummary,
  EdgarFilingsResult,
} from "@/lib/services/edgar";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Separator } from "@/lib/components/ui/separator";

interface FetchState {
  loading: boolean;
  error: string | null;
}

export function EdgarFilingsTester() {
  const [ticker, setTicker] = useState("AAPL");
  const [result, setResult] = useState<EdgarFilingsResult | null>(null);
  const [state, setState] = useState<FetchState>({ loading: false, error: null });

  const formattedLastUpdated = useMemo(() => {
    if (!result?.lastUpdated) return null;
    try {
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(new Date(result.lastUpdated));
    } catch (error) {
      console.error("Failed to format last updated date", error);
      return result.lastUpdated;
    }
  }, [result?.lastUpdated]);

  const fetchFilings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTicker = ticker.trim();
    if (!trimmedTicker) {
      setState({ loading: false, error: "Ticker symbol is required" });
      return;
    }

    setState({ loading: true, error: null });

    try {
      const response = await fetch("/api/admin/edgar/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: trimmedTicker, limit: 25 }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Request failed: ${response.status}`);
      }

      const data: EdgarFilingsResult = await response.json();
      setResult(data);
    } catch (error) {
      setState({
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch SEC filings",
      });
      return;
    }

    setState({ loading: false, error: null });
  };

  const hasFilings = (result?.filings?.length || 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SEC Edgar Tester</h1>
        <p className="text-muted-foreground mt-2">
          Validate the SEC Edgar integration by fetching recent company filings
          using an official ticker symbol.
        </p>
      </div>

      <Card className="p-6">
        <form className="space-y-4" onSubmit={fetchFilings}>
          <div className="space-y-2">
            <Label htmlFor="ticker">Ticker Symbol</Label>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <Input
                id="ticker"
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                placeholder="Enter ticker (e.g. AAPL)"
                className="md:max-w-xs"
                maxLength={10}
              />
              <Button type="submit" disabled={state.loading}>
                {state.loading ? "Fetching..." : "Fetch Filings"}
              </Button>
            </div>
          </div>

          {state.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            We recommend using a dedicated SEC Edgar API key and descriptive
            user agent (e.g. "Printer/1.0 contact@yourcompany.com").
          </p>
        </form>
      </Card>

      {result && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="space-y-2">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {result.companyName} ({result.ticker})
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    CIK: {result.cik}
                  </p>
                </div>
                {formattedLastUpdated && (
                  <p className="text-sm text-muted-foreground">
                    Last updated: {formattedLastUpdated}
                  </p>
                )}
              </div>

              <Separator />

              {hasFilings ? (
                <div className="space-y-4">
                  {result.filings.map((filing: EdgarFilingSummary) => (
                    <div
                      key={filing.accessionNumber}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge>{filing.formType}</Badge>
                            <p className="text-sm text-muted-foreground">
                              Filed on {filing.filingDate}
                            </p>
                          </div>
                          <p className="font-medium">
                            {filing.description || filing.primaryDocument}
                          </p>
                          {filing.reportDate && (
                            <p className="text-sm text-muted-foreground">
                              Report Date: {filing.reportDate}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Accession: {filing.accessionNumber}
                          </p>
                          {filing.items && (
                            <p className="text-xs text-muted-foreground">
                              Items: {filing.items}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 md:w-56">
                          <Button variant="outline" asChild>
                            <a
                              href={filing.filingDetailUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View Filing Details
                            </a>
                          </Button>
                          <Button asChild>
                            <a
                              href={filing.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Download Document
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recent filings were returned for this ticker.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
