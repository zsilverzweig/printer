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

import { CompanyResearch } from "../types";

interface CompanyResearchListProps {
  research: CompanyResearch[];
  selectedResearch: CompanyResearch | null;
  onSelectResearch: (research: CompanyResearch | null) => void;
  onDeleteResearch: (id: string) => void;
  loading: boolean;
}

export function CompanyResearchList({
  research,
  selectedResearch,
  onSelectResearch,
  onDeleteResearch,
  loading,
}: CompanyResearchListProps) {
  
  // Debug logging to see if list component is receiving updates
  console.log("CompanyResearchList render", {
    researchCount: research.length,
    researchStatuses: research.map(r => ({ id: r.id, ticker: r.companyTicker, status: r.status })),
    selectedResearchId: selectedResearch?.id,
    loading
  });
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
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (research.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Research History</CardTitle>
          <CardDescription>Your company research reports</CardDescription>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            <h3 className="text-lg font-medium mb-2">No research yet</h3>
            <p>
              Create your first company research to start building your investment knowledge base.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Research History</CardTitle>
        <CardDescription>
          {research.length} research report{research.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {research.map((item) => (
            <div
              key={item.id}
              className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                selectedResearch?.id === item.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
              }`}
              onClick={() => onSelectResearch(item)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm truncate">
                      {item.companyTicker}
                    </h4>
                    <Badge className={getStatusColor(item.status)}>
                      {getStatusLabel(item.status)}
                    </Badge>
                  </div>
                  
                  {item.companyName && (
                    <p className="text-xs text-muted-foreground mb-1">
                      {item.companyName}
                    </p>
                  )}
                  
                  <p className="text-xs text-muted-foreground mb-2">
                    Agent: {item.agentName}
                  </p>
                  
                  {item.executiveSummary && (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {item.executiveSummary}
                    </p>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDate(item.createdAt)}
                  </p>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteResearch(item.id);
                  }}
                  className="ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
