// Portfolio Service - Pure CRUD operations for portfolios
import { log } from "@/lib/utils/logger";

import { CreatePortfolioRequest, Portfolio, UpdatePortfolioRequest } from "../types";

export class PortfolioService {
  /**
   * Create a new portfolio
   */
  static async createPortfolio(request: CreatePortfolioRequest): Promise<Portfolio> {
    try {
      log.info("Creating portfolio", { 
        name: request.name,
        thesisLength: request.thesis?.length || 0 
      }, "PortfolioService");

      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create portfolio");
      }

      const data = await response.json();
      const portfolio = data.portfolio;

      log.success("Portfolio created successfully", {
        portfolioId: portfolio.id,
        name: portfolio.name
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
