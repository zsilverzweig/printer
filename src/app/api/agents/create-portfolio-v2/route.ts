import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

import { FinancialAnalystAgent } from "@/features/agents/financial-analyst";
import { PortfolioManagerAgent } from "@/features/agents/portfolio-manager";
import { ResearchAnalystAgent } from "@/features/agents/research-analyst";
import { Portfolio } from "@/features/finance/portfolios/types";
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        status: "initializing",
        metadata: {
          generatedByAI: true,
          aiModel: "chained-agents-v2",
          generatedAt: new Date().toISOString(),
          betaVersion: true,
        },
      };

      // Save initial portfolio
      await setDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), portfolio);

      // Define the workflow steps
      const workflowSteps = [
        {
          name: "market_analysis",
          agent: ResearchAnalystAgent,
          jobName: "analyzeMarkets" as const,
          input: { thesis },
          updatePortfolio: (result: any) => {
            portfolio.marketContext = result.marketAnalysis ?? "";
          },
          nextStatus: ResearchAnalystAgent.jobs.identifyCompanies.statusMessage,
        },
        {
          name: "company_identification",
          agent: ResearchAnalystAgent,
          jobName: "identifyCompanies" as const,
          input: (prevResult: any) => ({ thesis, marketAnalysis: prevResult }),
          updatePortfolio: () => {},
          nextStatus: FinancialAnalystAgent.jobs.validateStocks.statusMessage,
        },
        {
          name: "stock_validation",
          agent: FinancialAnalystAgent,
          jobName: "validateStocks" as const,
          input: (prevResult: any) => ({ companies: prevResult.companies }),
          updatePortfolio: () => {},
          nextStatus: FinancialAnalystAgent.jobs.setPriceTargets.statusMessage,
        },
        {
          name: "price_targets",
          agent: FinancialAnalystAgent,
          jobName: "setPriceTargets" as const,
          input: (prevResult: any, marketAnalysis: any) => ({
            companies: prevResult.validCompanies,
            marketContext: marketAnalysis,
          }),
          updatePortfolio: () => {},
          nextStatus:
            FinancialAnalystAgent.jobs.identifyCatalysts.statusMessage,
        },
        {
          name: "catalyst_analysis",
          agent: FinancialAnalystAgent,
          jobName: "identifyCatalysts" as const,
          input: (prevResult: any) => ({ companies: prevResult.companies }),
          updatePortfolio: () => {},
          nextStatus:
            PortfolioManagerAgent.jobs.optimizePortfolio.statusMessage,
        },
        {
          name: "portfolio_optimization",
          agent: PortfolioManagerAgent,
          jobName: "optimizePortfolio" as const,
          input: (prevResult: any, marketAnalysis: any) => ({
            thesis,
            companies: prevResult.catalysts.map((c: any) => ({
              symbol: c.symbol,
              name: c.name,
            })),
            priceTargets: prevResult,
            catalysts: prevResult.catalysts,
          }),
          updatePortfolio: (result: any, catalysts: any) => {
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
                  catalysts.catalysts.find((c: any) => c.symbol === pos.symbol)
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
        // Prepare input
        const input =
          typeof step.input === "function"
            ? step.input(previousResult, marketAnalysis)
            : step.input;

        // Execute agent job
        const job = step.agent.jobs[step.jobName];
        const result = await executeAgentJob(
          context,
          {
            agent: step.agent,
            jobName: step.jobName,
            inputValidator: job.inputSchema,
            outputValidator: job.outputSchema,
          },
          input
        );

        // Update portfolio
        if (step.name === "portfolio_optimization") {
          step.updatePortfolio(result, previousResult);
        } else {
          step.updatePortfolio(result);
        }
        portfolio.status = step.nextStatus ?? portfolio.status;
        portfolio.updatedAt = new Date().toISOString();

        // Save to database
        await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
          ...(step.name === "market_analysis" && {
            marketContext: portfolio.marketContext,
          }),
          ...(step.name === "portfolio_optimization" && {
            name: portfolio.name,
            description: portfolio.description,
            positions: portfolio.positions,
          }),
          status: portfolio.status,
          updatedAt: serverTimestamp(),
        });

        // Store results for next steps
        if (step.name === "market_analysis") marketAnalysis = result;
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
