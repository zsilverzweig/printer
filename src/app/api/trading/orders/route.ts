import { NextRequest, NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";
import { log } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const status = searchParams.get("status") || "all";
    const limit = searchParams.get("limit") || "25";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    log.debug(
      "Fetching trading orders",
      { userId, status, limit },
      "TradingOrdersAPI"
    );

    // Get orders data from Alpaca using stored OAuth tokens
    const orders = await alpacaService.getOrders(
      userId,
      status,
      Number.parseInt(limit)
    );

    return NextResponse.json({ orders });
  } catch (error) {
    log.failure("Failed to fetch trading orders", error, "TradingOrdersAPI");

    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      log.error(
        "Missing userId parameter",
        { url: request.url },
        "TradingOrdersAPI"
      );
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    let orderData: any;
    try {
      orderData = await request.json();
    } catch (parseError) {
      log.error(
        "Failed to parse order data from request body",
        {
          userId,
          parseError:
            parseError instanceof Error
              ? parseError.message
              : "Unknown parse error",
        },
        "TradingOrdersAPI"
      );
      return NextResponse.json(
        { error: "Invalid order data format" },
        { status: 400 }
      );
    }

    log.info(
      "Placing trading order",
      {
        userId,
        orderData: {
          symbol: orderData.symbol,
          side: orderData.side,
          type: orderData.type,
          qty: orderData.qty,
          notional: orderData.notional,
          time_in_force: orderData.time_in_force,
          limit_price: orderData.limit_price,
          stop_price: orderData.stop_price,
          extended_hours: orderData.extended_hours,
          position_side: orderData.position_side,
        },
      },
      "TradingOrdersAPI"
    );

    // Place order via Alpaca using stored OAuth tokens
    const order = await alpacaService.placeOrder(userId, orderData);

    log.success(
      "Successfully placed trading order",
      {
        userId,
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        status: order.status,
      },
      "TradingOrdersAPI"
    );

    return NextResponse.json({ order });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    log.failure(
      "Failed to place trading order",
      {
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
        userId: request.nextUrl.searchParams.get("userId"),
      },
      "TradingOrdersAPI"
    );

    // Return more specific error messages based on the error type
    let statusCode = 500;
    let userMessage = "Failed to place order";

    if (errorMessage.includes("No Alpaca connection found")) {
      statusCode = 401;
      userMessage = "Please connect your Alpaca account first";
    } else if (errorMessage.includes("Alpaca connection is not active")) {
      statusCode = 401;
      userMessage =
        "Your Alpaca connection has expired. Please reconnect your account";
    } else if (errorMessage.includes("Symbol is required")) {
      statusCode = 400;
      userMessage = "Stock symbol is required";
    } else if (errorMessage.includes("Valid side")) {
      statusCode = 400;
      userMessage = "Order side must be 'buy' or 'sell'";
    } else if (errorMessage.includes("Valid order type")) {
      statusCode = 400;
      userMessage = "Invalid order type";
    } else if (errorMessage.includes("quantity or notional")) {
      statusCode = 400;
      userMessage = "Either quantity or dollar amount is required";
    } else if (errorMessage.includes("insufficient buying power")) {
      statusCode = 400;
      userMessage = "Insufficient buying power for this order";
    } else if (errorMessage.includes("market is closed")) {
      statusCode = 400;
      userMessage = "Market is currently closed";
    } else if (errorMessage.includes("invalid symbol")) {
      statusCode = 400;
      userMessage = "Invalid stock symbol";
    }

    return NextResponse.json(
      {
        error: userMessage,
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: statusCode }
    );
  }
}
