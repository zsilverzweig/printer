"use client";

import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { Textarea } from "@/lib/components/ui/textarea";

import { CreateCompanyResearchRequest } from "../types";

interface CreateResearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateResearch: (request: CreateCompanyResearchRequest) => Promise<void>;
  creating: boolean;
}

export function CreateResearchDialog({
  open,
  onOpenChange,
  onCreateResearch,
  creating,
}: CreateResearchDialogProps) {
  const [formData, setFormData] = useState({
    companyTicker: "",
    researchFocus: [] as string[],
    investmentThesis: "",
    specificQuestions: "",
    timeframe: "medium_term" as "short_term" | "medium_term" | "long_term",
  });

  const researchFocusOptions = [
    { value: "financials", label: "Financial Analysis" },
    { value: "competitive_analysis", label: "Competitive Analysis" },
    { value: "growth_prospects", label: "Growth Prospects" },
    { value: "management", label: "Management & Governance" },
    { value: "market_position", label: "Market Position" },
    { value: "risks", label: "Risk Assessment" },
    { value: "valuation", label: "Valuation Analysis" },
    { value: "industry_trends", label: "Industry Trends" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.companyTicker) {
      return;
    }

    const request: CreateCompanyResearchRequest = {
      companyTicker: formData.companyTicker.toUpperCase(),
      researchFocus: formData.researchFocus,
      additionalContext: {
        investmentThesis: formData.investmentThesis || undefined,
        specificQuestions: formData.specificQuestions
          ? formData.specificQuestions.split('\n').filter(q => q.trim())
          : undefined,
        timeframe: formData.timeframe,
      },
    };

    try {
      await onCreateResearch(request);
      // Reset form
      setFormData({
        companyTicker: "",
        researchFocus: [],
        investmentThesis: "",
        specificQuestions: "",
        timeframe: "medium_term",
      });
    } catch (error) {
      // Error handling is done in parent component
    }
  };

  const handleFocusChange = (focus: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      researchFocus: checked
        ? [...prev.researchFocus, focus]
        : prev.researchFocus.filter(f => f !== focus)
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Create Company Research</CardTitle>
          <CardDescription>
            Use our AI research agent to conduct comprehensive analysis on a company
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Ticker */}
            <div className="space-y-2">
              <Label htmlFor="ticker">Company Ticker Symbol *</Label>
              <Input
                id="ticker"
                placeholder="e.g., AAPL, GOOGL, TSLA"
                value={formData.companyTicker}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  companyTicker: e.target.value.toUpperCase() 
                }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the stock ticker symbol for the company you want to research
              </p>
            </div>


            {/* Research Focus */}
            <div className="space-y-2">
              <Label>Research Focus Areas</Label>
              <div className="grid grid-cols-2 gap-2">
                {researchFocusOptions.map((option) => (
                  <label key={option.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.researchFocus.includes(option.value)}
                      onChange={(e) => handleFocusChange(option.value, e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select the areas you want the agent to focus on (optional)
              </p>
            </div>

            {/* Investment Thesis */}
            <div className="space-y-2">
              <Label htmlFor="thesis">Investment Thesis (Optional)</Label>
              <Textarea
                id="thesis"
                placeholder="Describe your investment thesis or hypothesis about this company..."
                value={formData.investmentThesis}
                onChange={(e) => setFormData(prev => ({ ...prev, investmentThesis: e.target.value }))}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Provide context about your investment perspective to guide the research
              </p>
            </div>

            {/* Specific Questions */}
            <div className="space-y-2">
              <Label htmlFor="questions">Specific Questions (Optional)</Label>
              <Textarea
                id="questions"
                placeholder="What specific questions do you want answered? (One per line)"
                value={formData.specificQuestions}
                onChange={(e) => setFormData(prev => ({ ...prev, specificQuestions: e.target.value }))}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                List specific questions you want the research to address
              </p>
            </div>

            {/* Timeframe */}
            <div className="space-y-2">
              <Label htmlFor="timeframe">Investment Timeframe</Label>
              <Select
                value={formData.timeframe}
                onValueChange={(value: "short_term" | "medium_term" | "long_term") => 
                  setFormData(prev => ({ ...prev, timeframe: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short_term">Short Term (1-12 months)</SelectItem>
                  <SelectItem value="medium_term">Medium Term (1-3 years)</SelectItem>
                  <SelectItem value="long_term">Long Term (3+ years)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select your investment timeframe to tailor the research focus
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !formData.companyTicker}>
                {creating ? "Creating Research..." : "Create Research"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
