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
import { Separator } from "@/lib/components/ui/separator";

import { CompanyResearch } from "../types";

interface CompanyResearchDetailsProps {
  research: CompanyResearch;
  onRefresh: () => Promise<void>;
}

export function CompanyResearchDetails({
  research,
  onRefresh,
}: CompanyResearchDetailsProps) {
  const getStatusColor = (status: CompanyResearch['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: CompanyResearch['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMetrics = (metrics: any) => {
    if (!metrics || Object.keys(metrics).length === 0) {
      return <p className="text-muted-foreground text-sm">No metrics available</p>;
    }

    return (
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
            </p>
            <p className="text-sm font-semibold">
              {typeof value === 'number' 
                ? value.toLocaleString() 
                : value?.toString() || 'N/A'
              }
            </p>
          </div>
        ))}
      </div>
    );
  };

  const renderContext = () => {
    const { userContext, agentContext, marketContext } = research.researchContext;

    return (
      <div className="space-y-4">
        {/* User Context */}
        <div>
          <h4 className="text-sm font-medium mb-2">Research Context</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium">User Role:</span> {userContext.userRole}</p>
            {userContext.investmentProfile && (
              <>
                <p><span className="font-medium">Risk Tolerance:</span> {userContext.investmentProfile.riskTolerance}</p>
                <p><span className="font-medium">Investment Horizon:</span> {userContext.investmentProfile.investmentHorizon}</p>
              </>
            )}
          </div>
        </div>

        {/* Agent Context */}
        <div>
          <h4 className="text-sm font-medium mb-2">Agent Details</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium">Agent:</span> {agentContext.agentName}</p>
            <p><span className="font-medium">Role:</span> {agentContext.agentRole}</p>
            <p><span className="font-medium">Model:</span> {agentContext.model}</p>
            <p><span className="font-medium">Temperature:</span> {agentContext.temperature}</p>
          </div>
        </div>

        {/* Market Context */}
        {marketContext && (
          <div>
            <h4 className="text-sm font-medium mb-2">Market Context</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><span className="font-medium">Market Conditions:</span> {marketContext.marketConditions}</p>
              <p><span className="font-medium">Timestamp:</span> {formatDate(marketContext.timestamp)}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">
                {research.companyTicker}
                {research.companyName && (
                  <span className="text-lg font-normal text-muted-foreground ml-2">
                    - {research.companyName}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Research by {research.agentName}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(research.status)}>
                {getStatusLabel(research.status)}
              </Badge>
              <Button variant="outline" size="sm" onClick={onRefresh}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><span className="font-medium">Created:</span> {formatDate(research.createdAt)}</p>
            <p><span className="font-medium">Last Updated:</span> {formatDate(research.updatedAt)}</p>
            {research.completedAt && (
              <p><span className="font-medium">Completed:</span> {formatDate(research.completedAt)}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {research.status === 'failed' && research.errorMessage && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="text-red-800">
              <h4 className="font-semibold mb-2">Research Failed</h4>
              <p className="text-sm">{research.errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {research.status === 'in_progress' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="text-blue-800">
              <h4 className="font-semibold mb-2">Research in Progress</h4>
              <p className="text-sm">
                The AI agent is currently conducting research on {research.companyTicker}. 
                This may take a few minutes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending State */}
      {research.status === 'pending' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="text-yellow-800">
              <h4 className="font-semibold mb-2">Research Pending</h4>
              <p className="text-sm">
                Research request has been queued and will begin shortly.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research Content */}
      {research.status === 'completed' && (
        <>
          {/* Executive Summary */}
          {research.executiveSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Executive Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{research.executiveSummary}</p>
              </CardContent>
            </Card>
          )}

          {/* Key Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Key Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              {renderMetrics(research.keyMetrics)}
            </CardContent>
          </Card>

          {/* Full Research Report */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Full Research Report</CardTitle>
              <CardDescription>
                Detailed analysis and insights from the AI agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {research.researchReport}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Research Context */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Research Context</CardTitle>
              <CardDescription>
                Context and metadata about this research
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderContext()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
