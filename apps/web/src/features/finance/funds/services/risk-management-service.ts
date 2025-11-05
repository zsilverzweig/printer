/**
 * Risk Management Service
 *
 * Manages default risk management settings that apply to all funds
 * unless overridden by fund-specific settings.
 * Uses backend API to store settings in database.
 */

export interface DefaultRiskSettings {
  maxLossPercent: number | null;
  maxLossDollars: number | null;
  maxGivebackPercent: number | null;
  maxOrderAgeSeconds: number;
  sizePerTrade: number;
  minBetPercent: number | null;
  maxBetPercent: number | null;
  maxTotalExposure: number | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const DEFAULT_VALUES: DefaultRiskSettings = {
  maxLossPercent: null,
  maxLossDollars: null,
  maxGivebackPercent: null,
  maxOrderAgeSeconds: 60,
  sizePerTrade: 1000,
  minBetPercent: null,
  maxBetPercent: null,
  maxTotalExposure: null,
};

export const riskManagementService = {
  /**
   * Get default risk settings from API
   */
  async getDefaults(): Promise<DefaultRiskSettings> {
    try {
      const response = await fetch(
        `${API_BASE}/api/funds/default-risk-settings`
      );

      if (!response.ok) {
        console.error(
          "Failed to fetch default risk settings:",
          response.statusText
        );
        return DEFAULT_VALUES;
      }

      const data = await response.json();

      // Convert snake_case from API to camelCase
      return {
        maxLossPercent: data.max_loss_percent ?? null,
        maxLossDollars: data.max_loss_dollars ?? null,
        maxGivebackPercent: data.max_giveback_percent ?? null,
        maxOrderAgeSeconds: data.max_order_age_seconds ?? 60,
        sizePerTrade: data.size_per_trade ?? 1000,
        minBetPercent: data.min_bet_percent ?? null,
        maxBetPercent: data.max_bet_percent ?? null,
        maxTotalExposure: data.max_total_exposure ?? null,
      };
    } catch (err) {
      console.error("Error fetching default risk settings:", err);
      return DEFAULT_VALUES;
    }
  },

  /**
   * Update default risk settings via API
   */
  async updateDefaults(settings: Partial<DefaultRiskSettings>): Promise<void> {
    try {
      // Convert camelCase to snake_case for API
      const payload: any = {};
      if (settings.maxLossPercent !== undefined) {
        payload.max_loss_percent = settings.maxLossPercent;
      }
      if (settings.maxLossDollars !== undefined) {
        payload.max_loss_dollars = settings.maxLossDollars;
      }
      if (settings.maxGivebackPercent !== undefined) {
        payload.max_giveback_percent = settings.maxGivebackPercent;
      }
      if (settings.maxOrderAgeSeconds !== undefined) {
        payload.max_order_age_seconds = settings.maxOrderAgeSeconds;
      }
      if (settings.sizePerTrade !== undefined) {
        payload.size_per_trade = settings.sizePerTrade;
      }
      if (settings.minBetPercent !== undefined) {
        payload.min_bet_percent = settings.minBetPercent;
      }
      if (settings.maxBetPercent !== undefined) {
        payload.max_bet_percent = settings.maxBetPercent;
      }
      if (settings.maxTotalExposure !== undefined) {
        payload.max_total_exposure = settings.maxTotalExposure;
      }

      const response = await fetch(
        `${API_BASE}/api/funds/default-risk-settings`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save default risk settings: ${errorText}`);
      }
    } catch (err) {
      console.error("Error saving default risk settings:", err);
      throw err;
    }
  },

  /**
   * Reset to default values (sets all to null/defaults)
   */
  async resetDefaults(): Promise<void> {
    await this.updateDefaults({
      maxLossPercent: null,
      maxLossDollars: null,
      maxGivebackPercent: null,
      maxOrderAgeSeconds: 60,
      sizePerTrade: 1000,
      minBetPercent: null,
      maxBetPercent: null,
      maxTotalExposure: null,
    });
  },

  /**
   * Merge defaults with fund-specific settings
   * Fund-specific values take precedence over defaults
   * Note: This is now async and requires await
   */
  async mergeWithDefaults(
    fundSettings: Partial<DefaultRiskSettings>
  ): Promise<DefaultRiskSettings> {
    const defaults = await this.getDefaults();
    return {
      maxLossPercent: fundSettings.maxLossPercent ?? defaults.maxLossPercent,
      maxLossDollars: fundSettings.maxLossDollars ?? defaults.maxLossDollars,
      maxGivebackPercent:
        fundSettings.maxGivebackPercent ?? defaults.maxGivebackPercent,
      maxOrderAgeSeconds:
        fundSettings.maxOrderAgeSeconds ?? defaults.maxOrderAgeSeconds,
      sizePerTrade: fundSettings.sizePerTrade ?? defaults.sizePerTrade,
      minBetPercent: fundSettings.minBetPercent ?? defaults.minBetPercent,
      maxBetPercent: fundSettings.maxBetPercent ?? defaults.maxBetPercent,
      maxTotalExposure:
        fundSettings.maxTotalExposure ?? defaults.maxTotalExposure,
    };
  },
};
