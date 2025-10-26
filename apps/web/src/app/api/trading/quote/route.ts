import { NextRequest, NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";
import { log } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const symbol = searchParams.get("symbol");
    const environment = searchParams.get("environment") as "paper" | "live" | null;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
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
      "Fetching quote for symbol",
      { userId, symbol, environment },
      "QuoteAPI"
    );

    const quote = await alpacaService.getQuote(userId, symbol, environment);

    log.debug(
      "Quote fetched successfully",
      { userId, symbol, environment, quote },
      "QuoteAPI"
    );

    return NextResponse.json({ quote });
  } catch (error) {
    log.error(
      "Failed to fetch quote",
      { error: error instanceof Error ? error.message : "Unknown error" },
      "QuoteAPI"
    );

    const errorMessage = error instanceof Error ? error.message : "Failed to fetch quote";
    
    // Map specific errors to user-friendly messages
    let statusCode = 500;
    let userMessage = errorMessage;

    if (errorMessage.includes("No Alpaca connection found")) {
      statusCode = 401;
      userMessage = "Please connect your Alpaca account first";
    } else if (errorMessage.includes("Invalid symbol")) {
      statusCode = 400;
      userMessage = "Invalid stock symbol";
    } else if (errorMessage.includes("Market closed")) {
      statusCode = 400;
      userMessage = "Market is currently closed";
    }

    return NextResponse.json(
      { error: userMessage },
      { status: statusCode }
    );
  }
}
