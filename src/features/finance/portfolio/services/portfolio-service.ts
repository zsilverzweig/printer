// Portfolio Service - Pure CRUD operations for portfolios
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { COLLECTIONS, db } from "@/lib/services/firebase";
import { log } from "@/lib/utils/logger";

import {
  CreatePortfolioRequest,
  Portfolio,
  UpdatePortfolioRequest,
} from "../types";

export class PortfolioService {
  /**
   * Create a new portfolio using AI agent
   */
  static async createPortfolio(
    request: CreatePortfolioRequest
  ): Promise<Portfolio> {
    try {
      log.info(
        "Creating portfolio",
        {
          name: request.name,
          thesisLength: request.thesis?.length || 0,
        },
        "PortfolioService"
      );

      // Call the AI agent to generate the portfolio
      const response = await fetch("/api/agents/create-portfolio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ thesis: request.thesis }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create portfolio");
      }

      // The AI agent returns the portfolio data directly
      const portfolioData = await response.json();

      // Convert AI response to our Portfolio format
      const portfolioId = `portfolio_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const portfolio: Portfolio = {
        id: portfolioId,
        name: portfolioData.name || request.name,
        description: portfolioData.description || request.description,
        thesis: portfolioData.thesis,
        positions: portfolioData.positions || [],
        marketContext: portfolioData.marketContext || "",
        userId: request.userId || "unknown",
        status: "completed",
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...request.metadata,
          generatedByAI: true,
          aiModel: "portfolio-manager",
          generatedAt: new Date().toISOString(),
        },
      };

      // Save portfolio to Firestore
      const portfolioDoc = {
        ...portfolio,
        userId: request.userId || "unknown", // TODO: Get from auth context
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), portfolioDoc);

      log.success(
        "Portfolio created and saved successfully",
        {
          portfolioId: portfolio.id,
          name: portfolio.name,
          positionsCount: portfolio.positions.length,
          savedToFirestore: true,
        },
        "PortfolioService"
      );

      return portfolio;
    } catch (error) {
      log.failure("Failed to create portfolio", error, "PortfolioService");
      throw error;
    }
  }

  /**
   * Create a new portfolio using AI agent (Beta version with chained agents)
   */
  static async createPortfolioBeta(
    request: CreatePortfolioRequest
  ): Promise<{ portfolioId: string }> {
    try {
      log.info(
        "Creating portfolio (Beta)",
        {
          name: request.name,
          thesisLength: request.thesis?.length || 0,
        },
        "PortfolioService"
      );

      // Call the AI agent to generate the portfolio using the new chained approach
      const response = await fetch("/api/agents/create-portfolio-v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ thesis: request.thesis }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create portfolio");
      }

      // The API handles all the portfolio creation and saving
      const result = await response.json();

      log.success(
        "Portfolio creation started (Beta)",
        {
          portfolioId: result.portfolioId,
          thesisLength: request.thesis?.length || 0,
        },
        "PortfolioService"
      );

      return { portfolioId: result.portfolioId };
    } catch (error) {
      log.failure(
        "Failed to create portfolio (Beta)",
        error,
        "PortfolioService"
      );
      throw error;
    }
  }

  /**
   * Update an existing portfolio
   */
  static async updatePortfolio(
    portfolioId: string,
    updates: UpdatePortfolioRequest
  ): Promise<void> {
    try {
      log.info(
        "Updating portfolio",
        { portfolioId, updates },
        "PortfolioService"
      );

      // Prepare the update data with timestamp
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
      };

      // Update the document in Firestore
      await updateDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), updateData);

      log.success(
        "Portfolio updated successfully",
        { portfolioId },
        "PortfolioService"
      );
    } catch (error) {
      log.failure("Failed to update portfolio", error, "PortfolioService");
      throw error;
    }
  }

  /**
   * Delete a portfolio
   */
  static async deletePortfolio(portfolioId: string): Promise<void> {
    try {
      log.info("Deleting portfolio", { portfolioId }, "PortfolioService");

      // Delete the document from Firestore
      await deleteDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId));

      log.success(
        "Portfolio deleted successfully",
        { portfolioId },
        "PortfolioService"
      );
    } catch (error) {
      log.failure("Failed to delete portfolio", error, "PortfolioService");
      throw error;
    }
  }
}
