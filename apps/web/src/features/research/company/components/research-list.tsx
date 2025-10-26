"use client";

import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileText,
  Loader,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";

import { useResearchContext } from "../providers/research-provider";

export function ResearchList() {
  const { researchResults, selectedResearch, selectResearch, loading, error } =
    useResearchContext();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter research results based on search query
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return researchResults;

    const query = searchQuery.toLowerCase();
    return researchResults.filter(
      (research) =>
        research.companyName.toLowerCase().includes(query) ||
        research.ticker.toLowerCase().includes(query) ||
        research.summary.toLowerCase().includes(query) ||
        research.recommendation.toLowerCase().includes(query)
    );
  }, [researchResults, searchQuery]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Research History</CardTitle>
          <CardDescription>Loading your research results...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Research History</CardTitle>
          <CardDescription>Error loading research results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (researchResults.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Research History
          </CardTitle>
          <CardDescription>
            Your completed research reports will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No research results yet</p>
            <p className="text-sm">Start by researching a company above</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Research History
        </CardTitle>
        <CardDescription>
          {filteredResults.length} of {researchResults.length} research{" "}
          {researchResults.length === 1 ? "report" : "reports"}
          {searchQuery && ` matching "${searchQuery}"`}
        </CardDescription>

        {/* Search Bar */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, ticker, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filteredResults.length === 0 && searchQuery ? (
          <div className="text-center py-8">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">
              No research found matching "{searchQuery}"
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="mt-2"
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResults.map((research) => (
              <div
                key={research.id}
                className={`border rounded-lg p-4 transition-all duration-200 cursor-pointer hover:shadow-md hover:border-border/80 ${
                  selectedResearch?.id === research.id
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:bg-accent/50"
                }`}
                onClick={() => selectResearch(research)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg truncate text-foreground">
                        {research.companyName}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {research.ticker}
                      </Badge>
                      {research.status === "completed" ? (
                        <Badge
                          variant="default"
                          className="text-xs flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs flex items-center gap-1"
                        >
                          <Loader className="h-3 w-3 animate-spin" />
                          In Progress
                        </Badge>
                      )}
                      {selectedResearch?.id === research.id && (
                        <Badge variant="default" className="text-xs">
                          Selected
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {research.summary}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(research.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">
                          {research.recommendation.split(".")[0]}...
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ml-4 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectResearch(research);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
