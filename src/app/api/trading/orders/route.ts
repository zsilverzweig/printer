import { NextRequest, NextResponse } from "next/server";

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

    // TODO: Get user's OAuth tokens from database and use them to call Alpaca API
    // For now, return an error indicating the feature is not yet implemented
    return NextResponse.json(
      { error: "Trading orders integration not yet implemented" },
      { status: 501 }
    );
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
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const orderData = await request.json();

    log.debug(
      "Placing trading order",
      { userId, orderData },
      "TradingOrdersAPI"
    );

    // TODO: Get user's OAuth tokens from database and use them to call Alpaca API
    // For now, return an error indicating the feature is not yet implemented
    return NextResponse.json(
      { error: "Trading order placement not yet implemented" },
      { status: 501 }
    );
  } catch (error) {
    log.failure("Failed to place trading order", error, "TradingOrdersAPI");

    return NextResponse.json(
      { error: "Failed to place order" },
      { status: 500 }
    );
  }
}
