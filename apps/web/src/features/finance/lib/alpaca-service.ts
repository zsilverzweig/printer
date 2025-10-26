import { userService } from "@/lib/services/user-service";
import { log } from "@/lib/utils/logger";

import {
  AlpacaAccount,
  AlpacaMarketDataResponse,
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaPosition,
  AlpacaQuote,
  AlpacaQuoteData,
} from "./types/alpaca";

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
    let responseData: unknown = null;

    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      log.warn(
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

      if (responseData && typeof responseData === "object") {
        const data = responseData as Record<string, unknown>;
        if (typeof data.message === "string") {
          errorMessage = data.message;
        } else if (typeof data.error === "string") {
          errorMessage = data.error;
        }
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
    status = "all",
    limit = 25
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

  async getQuote(
    userId: string,
    symbol: string,
    environment: "paper" | "live"
  ): Promise<AlpacaQuote> {
    try {
      log.debug(
        "Fetching quote for symbol",
        { userId, symbol, environment },
        "AlpacaService"
      );

      // Get user's OAuth access token from their Alpaca connection
      const userProfile = await userService.getUserProfile(userId);
      const alpacaConnection = userProfile?.alpacaConnection;

      if (!alpacaConnection || alpacaConnection.status !== "active") {
        throw new Error(
          "No active Alpaca connection found. Please connect your Alpaca account first."
        );
      }

      // Use Alpaca's Market Data API with OAuth token
      // Note: This requires a Market Data subscription from Alpaca
      const sym = symbol.toUpperCase();
      // Use the plural endpoint with symbols query per docs:
      // https://docs.alpaca.markets/reference/stocklatestquotes-1
      const response = await fetch(
        `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${encodeURIComponent(
          sym
        )}`,
        {
          headers: {
            Authorization: `${alpacaConnection.tokenType} ${alpacaConnection.accessToken}`,
            accept: "application/json",
          },
        }
      );

      const rawBody = await response.text();
      if (!response.ok) {
        log.failure(
          "Market data HTTP error",
          { status: response.status, body: rawBody },
          "AlpacaService"
        );
        if (response.status === 401) {
          throw new Error(
            "Market Data API authentication failed. Please reconnect your Alpaca account."
          );
        } else if (response.status === 403) {
          throw new Error(
            "Market Data API subscription required. Please upgrade your Alpaca account to access real-time market data."
          );
        } else if (response.status === 404) {
          throw new Error("Invalid stock symbol");
        } else if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        throw new Error(`Market data service error: ${response.status}`);
      }

      let alpacaData: AlpacaMarketDataResponse;
      try {
        alpacaData = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw new Error("Unexpected market data response");
      }

      // Expected shapes per Alpaca docs:
      // 1) Single-symbol: { symbol: "AAPL", quote: { bp, bs, ap, as, t } }
      // 2) Multi-symbol: { quotes: [{ S, bp, bs, ap, as, t }, ...] } OR { quotes: { AAPL: { ... } } }
      let q: AlpacaQuoteData | undefined = alpacaData?.quote;
      if (!q && alpacaData?.quotes) {
        if (Array.isArray(alpacaData.quotes)) {
          q =
            alpacaData.quotes.find((x) => (x.S || x.symbol) === sym) ||
            alpacaData.quotes[0];
        } else if (
          typeof alpacaData.quotes === "object" &&
          alpacaData.quotes[sym]
        ) {
          q = alpacaData.quotes[sym];
        }
      }
      const quote: AlpacaQuote = {
        symbol: alpacaData?.symbol ?? q?.S ?? sym,
        bid: Number(q?.bp ?? q?.bid ?? 0),
        ask: Number(q?.ap ?? q?.ask ?? 0),
        bid_size: Number(q?.bs ?? q?.bidSize ?? 0),
        ask_size: Number(q?.as ?? q?.askSize ?? 0),
        timestamp: q?.t ?? alpacaData?.timestamp ?? new Date().toISOString(),
      };

      log.debug(
        "Quote fetched successfully",
        { userId, symbol, environment, quote },
        "AlpacaService"
      );

      return quote;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.failure(
        "Failed to fetch quote",
        {
          error: errorMessage,
          userId,
          symbol,
          environment,
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
