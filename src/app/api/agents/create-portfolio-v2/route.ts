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
import { executeAgentJob } from "@/lib/api/agent-executor";
import { AgentContext, withAgentMiddleware } from "@/lib/api/agent-middleware";
import { COLLECTIONS, db } from "@/lib/services/firebase";

export const POST = withAgentMiddleware(
  { logger: "CreatePortfolioV2API" },
  async (
    request: NextRequest,
    context: AgentContext
  ): Promise<NextResponse<any>> => {
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
      const initialPortfolio = {
        id: portfolioId,
        userId: context.user.uid,
        name: `Portfolio - ${new Date().toLocaleDateString()}`,
        description: "Generated portfolio (Beta)",
        thesis,
        positions: [],
        status: "building",
        currentStep: "market_analysis",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        metadata: {
          generatedByAI: true,
          aiModel: "chained-agents-v2",
          generatedAt: new Date().toISOString(),
          betaVersion: true,
        },
      };

      // Save initial portfolio
      await setDoc(
        doc(db, COLLECTIONS.PORTFOLIOS, portfolioId),
        initialPortfolio
      );

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

      // Update portfolio with market analysis
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        currentStep: "company_identification",
        updatedAt: serverTimestamp(),
        steps: {
          market_analysis: {
            status: "completed",
            data: marketAnalysis,
            completedAt: serverTimestamp(),
          },
        },
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

      // Update portfolio with company identification
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        currentStep: "stock_validation",
        updatedAt: serverTimestamp(),
        [`steps.company_identification`]: {
          status: "completed",
          data: companyList,
          completedAt: serverTimestamp(),
        },
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

      // Update portfolio with stock validation
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        currentStep: "price_targets",
        updatedAt: serverTimestamp(),
        [`steps.stock_validation`]: {
          status: "completed",
          data: validatedStocks,
          completedAt: serverTimestamp(),
        },
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

      // Update portfolio with price targets
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        currentStep: "catalyst_analysis",
        updatedAt: serverTimestamp(),
        [`steps.price_targets`]: {
          status: "completed",
          data: priceTargets,
          completedAt: serverTimestamp(),
        },
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

      // Update portfolio with catalyst analysis
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        currentStep: "portfolio_optimization",
        updatedAt: serverTimestamp(),
        [`steps.catalyst_analysis`]: {
          status: "completed",
          data: catalysts,
          completedAt: serverTimestamp(),
        },
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
          catalysts,
        }
      );

      // Final update with completed portfolio
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), {
        status: "completed",
        name: finalPortfolio.name,
        description: finalPortfolio.description,
        positions: finalPortfolio.positions,
        updatedAt: serverTimestamp(),
        [`steps.portfolio_optimization`]: {
          status: "completed",
          data: finalPortfolio,
          completedAt: serverTimestamp(),
        },
      });

      return NextResponse.json({ portfolioId, success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }
);
