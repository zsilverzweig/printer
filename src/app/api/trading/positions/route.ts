import { NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    log.debug("Fetching trading positions", { userId }, "TradingPositionsAPI");

    // TODO: Get user's OAuth tokens from database and use them to call Alpaca API
    // For now, return an error indicating the feature is not yet implemented
    return NextResponse.json(
      { error: "Trading positions integration not yet implemented" },
      { status: 501 }
    );
  } catch (error) {
    log.failure(
      "Failed to fetch trading positions",
      error,
      "TradingPositionsAPI"
    );

    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
