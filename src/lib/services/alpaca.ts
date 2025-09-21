import {
  AlpacaAccount,
  AlpacaListOrdersParams,
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaPosition,
} from "@/lib/types";
import { log } from "@/lib/utils/logger";

const DEFAULT_BASE_URL = "https://paper-api.alpaca.markets";

class AlpacaService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.ALPACA_API_BASE_URL || DEFAULT_BASE_URL;
  }

  private ensureCredentials(): { apiKey: string; secretKey: string } {
    const apiKey = process.env.ALPACA_API_KEY;
    const secretKey = process.env.ALPACA_SECRET_KEY;

    if (!apiKey || !secretKey) {
      throw new Error(
        "Alpaca API credentials are not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
      );
    }

    return { apiKey, secretKey };
  }

  private normalizeHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) {
      return {};
    }

    if (headers instanceof Headers) {
      const normalized: Record<string, string> = {};
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
      return normalized;
    }

    if (Array.isArray(headers)) {
      return headers.reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    }

    return headers;
  }

  private buildHeaders(headers?: HeadersInit): HeadersInit {
    const { apiKey, secretKey } = this.ensureCredentials();
    const normalized = this.normalizeHeaders(headers);

    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
      ...normalized,
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = this.buildHeaders(init.headers);

    log.debug(
      "Calling Alpaca API",
      { path, method: init.method || "GET" },
      "AlpacaService"
    );

    try {
      const response = await fetch(url, {
        ...init,
        headers,
      });

      const text = await response.text();
      const data = text ? this.safeJsonParse(text) : null;

      if (!response.ok) {
        const message = this.extractErrorMessage(
          data,
          response.statusText || "Unexpected Alpaca API error"
        );

        throw new Error(`Alpaca API error (${response.status}): ${message}`);
      }

      return data as T;
    } catch (error) {
      log.failure(
        "Alpaca API request failed",
        { path, method: init.method || "GET" },
        "AlpacaService"
      );
      throw error;
    }
  }

  private safeJsonParse(payload: string): unknown {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }

  private extractErrorMessage(payload: unknown, fallback: string): string {
    if (typeof payload === "string") {
      return payload;
    }

    if (payload && typeof payload === "object") {
      if ("message" in payload && typeof (payload as { message: unknown }).message === "string") {
        return (payload as { message: string }).message;
      }

      if ("error" in payload && typeof (payload as { error: unknown }).error === "string") {
        return (payload as { error: string }).error;
      }
    }

    return fallback;
  }

  async getAccount(): Promise<AlpacaAccount> {
    return this.request<AlpacaAccount>("/v2/account");
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    return this.request<AlpacaPosition[]>("/v2/positions");
  }

  async listOrders(params: AlpacaListOrdersParams = {}): Promise<AlpacaOrder[]> {
    const searchParams = new URLSearchParams();

    if (params.status) {
      searchParams.set("status", params.status);
    }
    if (typeof params.limit === "number") {
      searchParams.set("limit", params.limit.toString());
    }
    if (params.direction) {
      searchParams.set("direction", params.direction);
    }
    if (params.after) {
      searchParams.set("after", params.after);
    }
    if (params.until) {
      searchParams.set("until", params.until);
    }
    if (typeof params.nested === "boolean") {
      searchParams.set("nested", params.nested ? "true" : "false");
    }

    const query = searchParams.toString();
    const path = query ? `/v2/orders?${query}` : "/v2/orders";

    return this.request<AlpacaOrder[]>(path);
  }

  async placeOrder(order: AlpacaOrderRequest): Promise<AlpacaOrder> {
    const payload: Record<string, unknown> = {
      symbol: order.symbol.toUpperCase(),
      side: order.side,
      type: order.type,
      time_in_force: order.time_in_force,
      extended_hours: order.extended_hours ?? false,
    };

    if (typeof order.qty === "number") {
      payload.qty = order.qty.toString();
    }

    if (typeof order.notional === "number") {
      payload.notional = order.notional.toString();
    }

    if (typeof order.limit_price === "number") {
      payload.limit_price = order.limit_price;
    }

    if (typeof order.stop_price === "number") {
      payload.stop_price = order.stop_price;
    }

    if (order.position_side) {
      payload.position_side = order.position_side;
    }

    return this.request<AlpacaOrder>("/v2/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export const alpacaService = new AlpacaService();

export default alpacaService;
