import { NextRequest, NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const environment = searchParams.get("environment") as "paper" | "live";

    if (!userId || !environment) {
      return NextResponse.json(
        { error: "userId and environment parameters are required" },
        { status: 400 }
      );
    }

    const account = await alpacaService.getAccount(userId, environment);
    return NextResponse.json({ account });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Alpaca account details";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
