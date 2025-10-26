import { NextRequest, NextResponse } from "next/server";

import { userService } from "@/lib/services/user-service";
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

    log.debug(
      "Checking trading connection status",
      { userId },
      "TradingStatusAPI"
    );

    // Check if user has connected their Alpaca account
    const userProfile = await userService.getUserProfile(userId);
    const connected =
      userProfile?.alpacaConnection?.status === "active" || false;

    log.debug(
      "Trading connection status result",
      {
        userId,
        connected,
        hasAlpacaConnection: !!userProfile?.alpacaConnection,
        connectionStatus: userProfile?.alpacaConnection?.status,
      },
      "TradingStatusAPI"
    );

    return NextResponse.json({ connected });
  } catch (error) {
    log.failure(
      "Failed to check trading connection status",
      error,
      "TradingStatusAPI"
    );

    return NextResponse.json(
      { error: "Failed to check connection status" },
      { status: 500 }
    );
  }
}
