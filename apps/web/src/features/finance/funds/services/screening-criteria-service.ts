/**
 * Screening Criteria Service
 *
 * Handles CRUD operations for screening criteria configurations
 */

import {
  CreateScreeningCriteriaInput,
  ScreeningCriteria,
  UpdateScreeningCriteriaInput,
} from "@printer/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Parse date strings from API responses
 */
function parseScreeningCriteriaDates(data: any): ScreeningCriteria {
  return {
    ...data,
    createdAt: new Date(data.created_at || data.createdAt),
    updatedAt: new Date(data.updated_at || data.updatedAt),
  };
}

class ScreeningCriteriaService {
  /**
   * Get all screening criteria
   */
  async getScreeningCriteria(): Promise<ScreeningCriteria[]> {
    console.log(
      "📡 Fetching screening criteria from:",
      `${API_BASE}/api/screening-criteria`
    );

    const response = await fetch(`${API_BASE}/api/screening-criteria`);

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch screening criteria: ${response.status} ${response.statusText}`
      );
      throw new Error(
        `Failed to fetch screening criteria: ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log("✅ Received screening criteria:", data);

    return data.map(parseScreeningCriteriaDates);
  }

  /**
   * Get screening criteria by ID
   */
  async getScreeningCriteriaById(id: string): Promise<ScreeningCriteria> {
    console.log("📡 Fetching screening criteria:", id);

    const response = await fetch(`${API_BASE}/api/screening-criteria/${id}`);

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch screening criteria: ${response.status} ${response.statusText}`
      );
      throw new Error(
        `Failed to fetch screening criteria: ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log("✅ Received screening criteria:", data);

    return parseScreeningCriteriaDates(data);
  }

  /**
   * Create new screening criteria
   */
  async createScreeningCriteria(
    data: CreateScreeningCriteriaInput
  ): Promise<ScreeningCriteria> {
    console.log(
      "📤 Creating screening criteria at:",
      `${API_BASE}/api/screening-criteria`
    );
    console.log("📦 Request payload:", data);

    const response = await fetch(`${API_BASE}/api/screening-criteria`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    console.log("📡 Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Failed to create screening criteria: ${response.status} ${response.statusText}`
      );
      console.error(`❌ Error details:`, errorText);

      let errorDetail = response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.error || errorText;
      } catch {
        errorDetail = errorText;
      }

      throw new Error(`Failed to create screening criteria: ${errorDetail}`);
    }

    const result = await response.json();
    console.log("✅ Screening criteria created:", result);

    return parseScreeningCriteriaDates(result);
  }

  /**
   * Update existing screening criteria
   */
  async updateScreeningCriteria(
    id: string,
    data: UpdateScreeningCriteriaInput
  ): Promise<ScreeningCriteria> {
    console.log("📤 Updating screening criteria:", id);
    console.log("📦 Request payload:", data);

    const response = await fetch(`${API_BASE}/api/screening-criteria/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Failed to update screening criteria: ${response.status} ${response.statusText}`
      );
      console.error(`❌ Error details:`, errorText);

      let errorDetail = response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.error || errorText;
      } catch {
        errorDetail = errorText;
      }

      throw new Error(`Failed to update screening criteria: ${errorDetail}`);
    }

    const result = await response.json();
    console.log("✅ Screening criteria updated:", result);

    return parseScreeningCriteriaDates(result);
  }

  /**
   * Delete screening criteria
   * @throws Error if criteria is in use by any strategies
   */
  async deleteScreeningCriteria(id: string): Promise<void> {
    console.log("🗑️ Deleting screening criteria:", id);

    const response = await fetch(`${API_BASE}/api/screening-criteria/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Failed to delete screening criteria: ${response.status} ${response.statusText}`
      );
      console.error(`❌ Error details:`, errorText);

      let errorDetail = response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.error || errorText;
      } catch {
        errorDetail = errorText;
      }

      throw new Error(`Failed to delete screening criteria: ${errorDetail}`);
    }

    console.log("✅ Screening criteria deleted");
  }

  /**
   * Run screener with specific criteria and get matching tickers
   */
  async runScreener(
    criteriaId: string
  ): Promise<{ tickerCount: number; tickers: string[] }> {
    console.log("🔍 Running screener with criteria:", criteriaId);

    const response = await fetch(
      `${API_BASE}/api/screening-criteria/${criteriaId}/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ Failed to run screener: ${response.status} ${response.statusText}`
      );
      console.error(`❌ Error details:`, errorText);

      let errorDetail = response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.error || errorText;
      } catch {
        errorDetail = errorText;
      }

      throw new Error(`Failed to run screener: ${errorDetail}`);
    }

    const result = await response.json();
    console.log(`✅ Screener results: ${result.ticker_count} tickers matched`);

    return {
      tickerCount: result.ticker_count,
      tickers: result.tickers,
    };
  }
}

export const screeningCriteriaService = new ScreeningCriteriaService();
