import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

import { FinancialAnalystAgent } from "@/features/agents/financial-analyst";
import { PortfolioManagerAgent } from "@/features/agents/portfolio-manager";
import { ResearchAnalystAgent } from "@/features/agents/research-analyst";
import { Portfolio } from "@/features/finance/portfolio/types";
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";
import { COLLECTIONS, db } from "@/lib/services/firebase";

export const POST = withAgentMiddleware(
  { logger: "CreatePortfolioV2API" },
  async (
    request: NextRequest,
    context: AgentContext
  ): Promise<
    NextResponse<{ portfolioId: string; success: boolean } | { error: string }>
  > => {
    const body = await request.json();
    const { thesis } = body;

    if (!thesis || typeof thesis !== "string" || !thesis.trim()) {
      return NextResponse.json(
        { error: "Thesis is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    try {
      // Create initial portfolio
      const portfolioId = `portfolio_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Initialize portfolio object that will be enhanced with each step
      const portfolio: Portfolio = {
        id: portfolioId,
        name: `Portfolio - ${new Date().toLocaleDateString()}`,
        description: "Generated portfolio (Beta)",
        thesis,
        positions: [],
        marketContext: "",
        userId: context.user.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        status: "initializing",
        metadata: {},
      };

      // Save initial portfolio
      await setDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), portfolio);

      // Define the workflow steps - simple and readable
      const workflowSteps = [
        {
          agent: ResearchAnalystAgent,
          jobName: "analyzeMarkets" as const,
          input: () => ({ thesis }),
          saveOutputTo: (result: any, portfolio: Portfolio) => {
            portfolio.marketContext = result.marketAnalysis ?? "";
          },
          nextStatus: ResearchAnalystAgent.jobs.identifyCompanies.statusMessage,
        },
        {
          agent: ResearchAnalystAgent,
          jobName: "identifyCompanies" as const,
          input: (portfolio: Portfolio) => ({
            thesis: portfolio.thesis,
            marketAnalysis: portfolio.marketContext,
          }),
          saveOutputTo: (result: any, portfolio: Portfolio) => {
            // Save simplified positions with company name and tickers
            portfolio.positions = result.companies.map(
              (company: any, index: number) => ({
                id: `pos_${portfolio.id}_${index}`,
                symbol: company.symbol,
                name: company.name,

                rationale: company.rationale,
              })
            );
          },
          nextStatus: FinancialAnalystAgent.jobs.validateStocks.statusMessage,
        },
        {
          agent: FinancialAnalystAgent,
          jobName: "validateStocks" as const,
          input: (portfolio: Portfolio, previousResult: any) => ({
            companies: previousResult.companies,
          }),
          saveOutputTo: () => {}, // No portfolio updates needed
          nextStatus: FinancialAnalystAgent.jobs.setPriceTargets.statusMessage,
        },
        {
          agent: FinancialAnalystAgent,
          jobName: "setPriceTargets" as const,
          input: (
            portfolio: Portfolio,
            previousResult: any,
            marketAnalysis: any
          ) => ({
            companies: previousResult.validCompanies,
            marketContext: marketAnalysis,
          }),
          saveOutputTo: () => {}, // No portfolio updates needed
          nextStatus:
            FinancialAnalystAgent.jobs.identifyCatalysts.statusMessage,
        },
        {
          agent: FinancialAnalystAgent,
          jobName: "identifyCatalysts" as const,
          input: (portfolio: Portfolio, previousResult: any) => ({
            companies: previousResult.companies,
          }),
          saveOutputTo: () => {}, // No portfolio updates needed
          nextStatus:
            PortfolioManagerAgent.jobs.optimizePortfolio.statusMessage,
        },
        {
          agent: PortfolioManagerAgent,
          jobName: "optimizePortfolio" as const,
          input: (portfolio: Portfolio, previousResult: any) => ({
            thesis: portfolio.thesis,
            companies: previousResult.catalysts.map((c: any) => ({
              symbol: c.symbol,
              name: c.name,
            })),
            priceTargets: previousResult,
            catalysts: previousResult.catalysts,
          }),
          saveOutputTo: (result: any, portfolio: Portfolio) => {
            portfolio.name = result.name;
            portfolio.description = result.description;
            portfolio.positions = result.positions.map(
              (pos: any, index: number) => ({
                id: `pos_${portfolioId}_${index}`,
                symbol: pos.symbol,
                name: pos.name,
                side: "buy" as const,
                status: "draft" as const,
                weight: pos.weight,
                catalyst:
                  result.catalysts?.find((c: any) => c.symbol === pos.symbol)
                    ?.catalyst || "",
                rationale: pos.rationale,
                priceTarget: pos.targetPrice || 0,
                reevaluateDate: new Date(
                  Date.now() + 90 * 24 * 60 * 60 * 1000
                ).toISOString(),
              })
            );
          },
          nextStatus: "completed",
        },
      ];

      // Execute workflow steps
      let marketAnalysis: any = null;
      let previousResult: any = null;

      for (const step of workflowSteps) {
        // Prepare input - pass portfolio and previous results
        const input = step.input(portfolio, previousResult, marketAnalysis);

        // Execute agent job
        const result = await executeAgentJob(
          step.agent,
          step.jobName,
          context,
          input
        );

        // Save output to portfolio
        step.saveOutputTo(result, portfolio);
        portfolio.status = step.nextStatus ?? portfolio.status;
        portfolio.updatedAt = new Date();

        // Save entire portfolio to database
        await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
          ...portfolio,
          updatedAt: serverTimestamp(),
        });

        // Store results for next steps
        if (step.jobName === "analyzeMarkets") marketAnalysis = result;
        previousResult = result;
      }

      return NextResponse.json({ portfolioId, success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }
);
