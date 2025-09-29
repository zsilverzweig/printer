import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

import {
  FinancialAnalystAgent,
  IdentifyCatalystsInput,
  IdentifyCatalystsOutput,
  SetPriceTargetsInput,
  SetPriceTargetsOutput,
  ValidateStocksInput,
  ValidateStocksOutput,
} from "@/features/agents/financial-analyst";
import {
  OptimizePortfolioInput,
  OptimizePortfolioOutput,
  PortfolioManagerAgent,
} from "@/features/agents/portfolio-manager";
import {
  AnalyzeMarketsInput,
  AnalyzeMarketsOutput,
  IdentifyCompaniesInput,
  IdentifyCompaniesOutput,
  ResearchAnalystAgent,
} from "@/features/agents/research-analyst";
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        status: "initializing",
        metadata: {
          generatedByAI: true,
          aiModel: "chained-agents-v2",
          generatedAt: new Date().toISOString(),
          betaVersion: true,
          userId: context.user.uid,
        },
      };

      // Save initial portfolio
      await setDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), portfolio);

      // Step 1: Market Analysis
      const marketAnalysis = await executeAgentJob<
        AnalyzeMarketsInput,
        AnalyzeMarketsOutput
      >(
        context,
        {
          agent: ResearchAnalystAgent,
          jobName: ResearchAnalystAgent.jobs.analyzeMarkets.name,
          inputValidator: ResearchAnalystAgent.jobs.analyzeMarkets.inputSchema,
          outputValidator:
            ResearchAnalystAgent.jobs.analyzeMarkets.outputSchema,
        },
        { thesis }
      );

      // Enhance portfolio with market analysis
      portfolio.marketContext = marketAnalysis.marketAnalysis ?? "";
      portfolio.status =
        ResearchAnalystAgent.jobs.identifyCompanies.statusMessage ??
        portfolio.status;
      portfolio.updatedAt = new Date().toISOString();

      // Update portfolio in database
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        marketContext: portfolio.marketContext,
        status: portfolio.status,
        updatedAt: serverTimestamp(),
      });

      // Step 2: Company Identification
      const companyList = await executeAgentJob<
        IdentifyCompaniesInput,
        IdentifyCompaniesOutput
      >(
        context,
        {
          agent: ResearchAnalystAgent,
          jobName: ResearchAnalystAgent.jobs.identifyCompanies.name,
          inputValidator:
            ResearchAnalystAgent.jobs.identifyCompanies.inputSchema,
          outputValidator:
            ResearchAnalystAgent.jobs.identifyCompanies.outputSchema,
        },
        { thesis, marketAnalysis }
      );

      // Enhance portfolio with company identification
      portfolio.status =
        FinancialAnalystAgent.jobs.validateStocks.statusMessage ??
        portfolio.status;
      portfolio.updatedAt = new Date().toISOString();

      // Update portfolio in database
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        status: portfolio.status,
        updatedAt: serverTimestamp(),
      });

      // Step 3: Stock Validation
      const validatedStocks = await executeAgentJob<
        ValidateStocksInput,
        ValidateStocksOutput
      >(
        context,
        {
          agent: FinancialAnalystAgent,
          jobName: FinancialAnalystAgent.jobs.validateStocks.name,
          inputValidator: FinancialAnalystAgent.jobs.validateStocks.inputSchema,
          outputValidator:
            FinancialAnalystAgent.jobs.validateStocks.outputSchema,
        },
        { companies: companyList.companies }
      );

      // Enhance portfolio with stock validation
      portfolio.status =
        FinancialAnalystAgent.jobs.setPriceTargets.statusMessage ??
        portfolio.status;
      portfolio.updatedAt = new Date().toISOString();

      // Update portfolio in database
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        status: portfolio.status,
        updatedAt: serverTimestamp(),
      });

      // Step 4: Price Targets
      const priceTargets = await executeAgentJob<
        SetPriceTargetsInput,
        SetPriceTargetsOutput
      >(
        context,
        {
          agent: FinancialAnalystAgent,
          jobName: FinancialAnalystAgent.jobs.setPriceTargets.name,
          inputValidator:
            FinancialAnalystAgent.jobs.setPriceTargets.inputSchema,
          outputValidator:
            FinancialAnalystAgent.jobs.setPriceTargets.outputSchema,
        },
        {
          companies: validatedStocks.validCompanies,
          marketContext: marketAnalysis,
        }
      );

      // Enhance portfolio with price targets
      portfolio.status =
        FinancialAnalystAgent.jobs.identifyCatalysts.statusMessage ??
        portfolio.status;
      portfolio.updatedAt = new Date().toISOString();

      // Update portfolio in database
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        status: portfolio.status,
        updatedAt: serverTimestamp(),
      });

      // Step 5: Catalyst Analysis
      const catalysts = await executeAgentJob<
        IdentifyCatalystsInput,
        IdentifyCatalystsOutput
      >(
        context,
        {
          agent: FinancialAnalystAgent,
          jobName: FinancialAnalystAgent.jobs.identifyCatalysts.name,
          inputValidator:
            FinancialAnalystAgent.jobs.identifyCatalysts.inputSchema,
          outputValidator:
            FinancialAnalystAgent.jobs.identifyCatalysts.outputSchema,
        },
        { companies: priceTargets.companies }
      );

      // Enhance portfolio with catalyst analysis
      portfolio.status =
        PortfolioManagerAgent.jobs.optimizePortfolio.statusMessage ??
        portfolio.status;
      portfolio.updatedAt = new Date().toISOString();

      // Update portfolio in database
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        status: portfolio.status,
        updatedAt: serverTimestamp(),
      });

      // Step 6: Portfolio Optimization
      const finalPortfolio = await executeAgentJob<
        OptimizePortfolioInput,
        OptimizePortfolioOutput
      >(
        context,
        {
          agent: PortfolioManagerAgent,
          jobName: PortfolioManagerAgent.jobs.optimizePortfolio.name,
          inputValidator:
            PortfolioManagerAgent.jobs.optimizePortfolio.inputSchema,
          outputValidator:
            PortfolioManagerAgent.jobs.optimizePortfolio.outputSchema,
        },
        {
          thesis,
          companies: catalysts.catalysts.map((c) => ({
            symbol: c.symbol,
            name: c.name,
          })), // Map catalyst companies
          priceTargets,
          catalysts: catalysts.catalysts, // Pass the full catalyst data
        }
      );

      // Enhance portfolio with final positions
      portfolio.name = finalPortfolio.name;
      portfolio.description = finalPortfolio.description;
      portfolio.positions = finalPortfolio.positions.map((pos, index) => ({
        id: `pos_${portfolioId}_${index}`,
        symbol: pos.symbol,
        name: pos.name,
        side: "buy" as const,
        status: "draft" as const,
        weight: pos.weight,
        catalyst:
          catalysts.catalysts.find((c) => c.symbol === pos.symbol)?.catalyst ||
          "",
        rationale: pos.rationale,
        priceTarget: pos.targetPrice || 0,
        reevaluateDate: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString(), // 90 days from now
      }));
      portfolio.status = "completed";
      portfolio.updatedAt = new Date().toISOString();

      // Final update with completed portfolio
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        name: portfolio.name,
        description: portfolio.description,
        positions: portfolio.positions,
        status: portfolio.status,
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({ portfolioId, success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }
);
