import { userService } from "@/lib/services/user-service";
import { log } from "@/lib/utils/logger";

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  equity: string;
  portfolio_value: string;
  shorting_enabled: boolean;
  pattern_day_trader: boolean;
  multiplier: string;
  trading_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_plpc_2: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at?: string;
  expired_at?: string;
  canceled_at?: string;
  failed_at?: string;
  replaced_at?: string;
  replaced_by?: string;
  replaces?: string;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional?: string;
  qty?: string;
  filled_qty: string;
  filled_avg_price?: string;
  order_class: string;
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  status: string;
  extended_hours: boolean;
  legs?: AlpacaOrder[];
  trail_percent?: string;
  trail_price?: string;
  hwm?: string;
  position_side?: string;
}

export interface AlpacaOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
  client_order_id?: string;
  order_class?: string;
  take_profit?: {
    limit_price: number;
  };
  stop_loss?: {
    stop_price: number;
    limit_price?: number;
  };
  trail_percent?: number;
  trail_price?: number;
  position_side?: "long" | "short";
}

class AlpacaService {
  private readonly paperBaseUrl: string;
  private readonly liveBaseUrl: string;

  constructor() {
    this.paperBaseUrl =
      process.env.ALPACA_PAPER_API_BASE_URL ||
      "https://paper-api.alpaca.markets";
    this.liveBaseUrl =
      process.env.ALPACA_LIVE_API_BASE_URL || "https://api.alpaca.markets";
  }

  private getBaseUrl(environment: "paper" | "live"): string {
    return environment === "paper" ? this.paperBaseUrl : this.liveBaseUrl;
  }

  private async getAccessToken(userId: string): Promise<string> {
    const userProfile = await userService.getUserProfile(userId);

    if (!userProfile?.alpacaConnection?.accessToken) {
      throw new Error("No Alpaca connection found for user");
    }

    if (userProfile.alpacaConnection.status !== "active") {
      throw new Error("Alpaca connection is not active");
    }

    return userProfile.alpacaConnection.accessToken;
  }

  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    userId: string,
    environment: "paper" | "live",
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await this.getAccessToken(userId);
    const baseUrl = this.getBaseUrl(environment);

    const url = `${baseUrl}${endpoint}`;

    log.debug(
      "Making authenticated request to Alpaca API",
      {
        url,
        method: options.method || "GET",
        userId,
        hasAccessToken: !!accessToken,
        accessTokenPreview: accessToken
          ? accessToken.substring(0, 10) + "..."
          : "none",
        requestBody: options.body
          ? JSON.parse(options.body as string)
          : undefined,
      },
      "AlpacaService"
    );

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const responseText = await response.text();
    let responseData: any = null;

    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      log.warning(
        "Failed to parse Alpaca API response as JSON",
        {
          url,
          status: response.status,
          responseText: responseText.substring(0, 500),
          parseError:
            parseError instanceof Error
              ? parseError.message
              : "Unknown parse error",
        },
        "AlpacaService"
      );
    }

    if (!response.ok) {
      log.error(
        "Alpaca API request failed",
        {
          url,
          method: options.method || "GET",
          status: response.status,
          statusText: response.statusText,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          responseText: responseText.substring(0, 1000),
          responseData,
          userId,
          requestBody: options.body
            ? JSON.parse(options.body as string)
            : undefined,
        },
        "AlpacaService"
      );

      // Try to extract a meaningful error message
      let errorMessage = `Alpaca API error: ${response.status} ${response.statusText}`;

      if (responseData?.message) {
        errorMessage = responseData.message;
      } else if (responseData?.error) {
        errorMessage = responseData.error;
      } else if (responseText) {
        errorMessage = responseText.substring(0, 200);
      }

      throw new Error(errorMessage);
    }

    log.debug(
      "Alpaca API request successful",
      {
        url,
        method: options.method || "GET",
        status: response.status,
        responseDataKeys: responseData ? Object.keys(responseData) : [],
        userId,
      },
      "AlpacaService"
    );

    return responseData as T;
  }

  async getAccount(
    userId: string,
    environment: "paper" | "live"
  ): Promise<AlpacaAccount> {
    log.debug(
      "Fetching Alpaca account",
      { userId, environment },
      "AlpacaService"
    );

    try {
      const account = await this.makeAuthenticatedRequest<AlpacaAccount>(
        "/v2/account",
        userId,
        environment
      );

      log.success(
        "Successfully fetched Alpaca account",
        { userId, environment },
        "AlpacaService"
      );
      return account;
    } catch (error) {
      log.failure("Failed to fetch Alpaca account", error, "AlpacaService");
      throw error;
    }
  }

  async getPositions(
    userId: string,
    environment: "paper" | "live"
  ): Promise<AlpacaPosition[]> {
    log.debug(
      "Fetching Alpaca positions",
      { userId, environment },
      "AlpacaService"
    );

    try {
      const positions = await this.makeAuthenticatedRequest<AlpacaPosition[]>(
        "/v2/positions",
        userId,
        environment
      );

      log.success(
        "Successfully fetched Alpaca positions",
        { userId, environment, count: positions.length },
        "AlpacaService"
      );
      return positions;
    } catch (error) {
      log.failure("Failed to fetch Alpaca positions", error, "AlpacaService");
      throw error;
    }
  }

  async getOrders(
    userId: string,
    environment: "paper" | "live",
    status: string = "all",
    limit: number = 25
  ): Promise<AlpacaOrder[]> {
    log.debug(
      "Fetching Alpaca orders",
      { userId, environment, status, limit },
      "AlpacaService"
    );

    try {
      const params = new URLSearchParams({
        status,
        limit: limit.toString(),
      });

      const orders = await this.makeAuthenticatedRequest<AlpacaOrder[]>(
        `/v2/orders?${params.toString()}`,
        userId,
        environment
      );

      log.success(
        "Successfully fetched Alpaca orders",
        { userId, environment, count: orders.length },
        "AlpacaService"
      );
      return orders;
    } catch (error) {
      log.failure("Failed to fetch Alpaca orders", error, "AlpacaService");
      throw error;
    }
  }

  async placeOrder(
    userId: string,
    order: AlpacaOrderRequest,
    environment: "paper" | "live"
  ): Promise<AlpacaOrder> {
    log.info(
      "Placing Alpaca order",
      {
        userId,
        environment,
        order: {
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          qty: order.qty,
          notional: order.notional,
          time_in_force: order.time_in_force,
          limit_price: order.limit_price,
          stop_price: order.stop_price,
          extended_hours: order.extended_hours,
          position_side: order.position_side,
        },
      },
      "AlpacaService"
    );

    try {
      // Validate order data before sending
      if (!order.symbol) {
        throw new Error("Symbol is required");
      }
      if (!order.side || !["buy", "sell"].includes(order.side)) {
        throw new Error("Valid side (buy/sell) is required");
      }
      if (
        !order.type ||
        !["market", "limit", "stop", "stop_limit", "trailing_stop"].includes(
          order.type
        )
      ) {
        throw new Error("Valid order type is required");
      }
      if (!order.qty && !order.notional) {
        throw new Error("Either quantity or notional amount is required");
      }

      const placedOrder = await this.makeAuthenticatedRequest<AlpacaOrder>(
        "/v2/orders",
        userId,
        environment,
        {
          method: "POST",
          body: JSON.stringify(order),
        }
      );

      log.success(
        "Successfully placed Alpaca order",
        {
          userId,
          environment,
          orderId: placedOrder.id,
          symbol: order.symbol,
          side: order.side,
          status: placedOrder.status,
          submittedAt: placedOrder.submitted_at,
        },
        "AlpacaService"
      );
      return placedOrder;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.failure(
        "Failed to place Alpaca order",
        {
          error: errorMessage,
          userId,
          environment,
          order: {
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            qty: order.qty,
            notional: order.notional,
          },
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        "AlpacaService"
      );
      throw error;
    }
  }
}

export const alpacaService = new AlpacaService();
export default alpacaService;
