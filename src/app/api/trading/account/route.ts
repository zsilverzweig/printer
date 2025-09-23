import { NextRequest, NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";
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

    log.debug("Fetching trading account data", { userId }, "TradingAccountAPI");

    // Get account data from Alpaca using stored OAuth tokens
    const account = await alpacaService.getAccount(userId);

    return NextResponse.json({ account });
  } catch (error) {
    log.failure(
      "Failed to fetch trading account data",
      error,
      "TradingAccountAPI"
    );

    return NextResponse.json(
      { error: "Failed to fetch account data" },
      { status: 500 }
    );
  }
}
