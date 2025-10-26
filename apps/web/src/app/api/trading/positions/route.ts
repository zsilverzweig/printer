import { NextRequest, NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";
import { log } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const environment = searchParams.get("environment") as
      | "paper"
      | "live"
      | null;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!environment || !["paper", "live"].includes(environment)) {
      return NextResponse.json(
        { error: "Valid environment (paper/live) is required" },
        { status: 400 }
      );
    }

    log.debug(
      "Fetching trading positions",
      { userId, environment },
      "TradingPositionsAPI"
    );

    // Get positions data from Alpaca using stored OAuth tokens
    const positions = await alpacaService.getPositions(userId, environment);

    return NextResponse.json({ positions });
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
