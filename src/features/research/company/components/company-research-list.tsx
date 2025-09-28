"use client";

import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { ConfirmationDialog } from "@/lib/components/ui/confirmation-dialog";
import { ListItem } from "@/lib/components/ui/list-item";
import { SearchBar } from "@/lib/components/ui/search-bar";
import { log } from "@/lib/utils/logger";

import { CompanyResearch } from "../types";

interface CompanyResearchListProps {
  research: CompanyResearch[];
  selectedResearch: CompanyResearch | null;
  onSelectResearch: (research: CompanyResearch | null) => void;
  onDeleteResearch: (id: string) => void;
  loading: boolean;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
}

export function CompanyResearchList({
  research,
  selectedResearch,
  onSelectResearch,
  onDeleteResearch,
  loading,
  searchTerm = "",
  onSearchChange,
}: CompanyResearchListProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [researchToDelete, setResearchToDelete] = useState<CompanyResearch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Debug logging to see if list component is receiving updates
  log.info("CompanyResearchList render", {
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

  const getRecommendationColor = (recommendation: string) => {
    const rec = recommendation?.toUpperCase();
    if (rec?.includes('BUY') || rec?.includes('STRONG BUY')) {
      return 'bg-green-100 text-green-800';
    } else if (rec?.includes('HOLD')) {
      return 'bg-yellow-100 text-yellow-800';
    } else if (rec?.includes('SELL') || rec?.includes('STRONG SELL')) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  const getRecommendationLabel = (recommendation: string) => {
    const rec = recommendation?.toUpperCase();
    if (rec?.includes('STRONG BUY')) return 'Strong Buy';
    if (rec?.includes('BUY')) return 'Buy';
    if (rec?.includes('HOLD')) return 'Hold';
    if (rec?.includes('STRONG SELL')) return 'Strong Sell';
    if (rec?.includes('SELL')) return 'Sell';
    return recommendation || 'No Rating';
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
          <CardTitle>Research Archive</CardTitle>
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
        <div className="flex items-center justify-between">
          <CardTitle>Research Archive</CardTitle>
          <span className="text-sm text-muted-foreground">
            {research.length} report{research.length !== 1 ? 's' : ''}
          </span>
        </div>
        {onSearchChange && (
          <div className="mt-4">
            <SearchBar
              placeholder="Search by ticker, company name, or agent..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {research.map((item) => (
            <ListItem
              key={item.id}
              selected={selectedResearch?.id === item.id}
              onClick={() => onSelectResearch(item)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm truncate">
                      {item.companyTicker}
                    </h4>
                    {item.status === 'completed' ? (
                      item.recommendation ? (
                        <Badge className={getRecommendationColor(item.recommendation)}>
                          {getRecommendationLabel(item.recommendation)}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">
                          No Rating
                        </Badge>
                      )
                    ) : (
                      <Badge className={getStatusColor(item.status)}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    )}
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
                    setResearchToDelete(item);
                    setDeleteConfirmOpen(true);
                  }}
                  className="ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  ×
                </Button>
              </div>
            </ListItem>
          ))}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setResearchToDelete(null);
        }}
        onConfirm={async () => {
          if (researchToDelete) {
            setIsDeleting(true);
            try {
              await onDeleteResearch(researchToDelete.id);
              setDeleteConfirmOpen(false);
              setResearchToDelete(null);
            } catch (error) {
              log.error("Failed to delete research:", error);
            } finally {
              setIsDeleting(false);
            }
          }
        }}
        title="Delete Research Report"
        description={`Are you sure you want to delete the research report for ${researchToDelete?.companyTicker}? This action cannot be undone.`}
        variant="destructive"
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        loadingText="Deleting..."
      />
    </Card>
  );
}
