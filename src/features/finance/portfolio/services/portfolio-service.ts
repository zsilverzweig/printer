// Portfolio Service - Pure CRUD operations for portfolios
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

import { db, COLLECTIONS } from "@/lib/services/firebase";
import { log } from "@/lib/utils/logger";

import { CreatePortfolioRequest, Portfolio, UpdatePortfolioRequest } from "../types";

export class PortfolioService {
  /**
   * Create a new portfolio using AI agent
   */
  static async createPortfolio(request: CreatePortfolioRequest): Promise<Portfolio> {
    try {
      log.info("Creating portfolio", { 
        name: request.name,
        thesisLength: request.thesis?.length || 0 
      }, "PortfolioService");

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
      const portfolioId = `portfolio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const portfolio: Portfolio = {
        id: portfolioId,
        name: portfolioData.name || request.name,
        description: portfolioData.description || request.description,
        thesis: portfolioData.thesis,
        positions: portfolioData.positions || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          ...request.metadata,
          generatedByAI: true,
          aiModel: 'portfolio-manager',
          generatedAt: new Date().toISOString()
        }
      };

      // Save portfolio to Firestore
      const portfolioDoc = {
        ...portfolio,
        userId: request.userId || 'unknown', // TODO: Get from auth context
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, COLLECTIONS.PORTFOLIOS, portfolioId), portfolioDoc);
      
      log.success("Portfolio created and saved successfully", {
        portfolioId: portfolio.id,
        name: portfolio.name,
        positionsCount: portfolio.positions.length,
        savedToFirestore: true
      }, "PortfolioService");

      return portfolio;
    } catch (error) {
      log.failure("Failed to create portfolio", error, "PortfolioService");
      throw error;
    }
  }

  /**
   * Update an existing portfolio
   */
  static async updatePortfolio(portfolioId: string, updates: UpdatePortfolioRequest): Promise<void> {
    try {
      log.info("Updating portfolio", { portfolioId }, "PortfolioService");

      const response = await fetch(`/api/portfolios/${portfolioId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update portfolio");
      }

      log.success("Portfolio updated successfully", { portfolioId }, "PortfolioService");
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

      const response = await fetch(`/api/portfolios/${portfolioId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete portfolio");
      }

      log.success("Portfolio deleted successfully", { portfolioId }, "PortfolioService");
    } catch (error) {
      log.failure("Failed to delete portfolio", error, "PortfolioService");
      throw error;
    }
  }
}
