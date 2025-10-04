import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { edgarService } from "@/lib/services/edgar";
import { log } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { ticker, limit } = body;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json(
        { error: "Ticker symbol is required" },
        { status: 400 }
      );
    }

    const filings = await edgarService.getRecentFilingsByTicker(
      ticker,
      typeof limit === "number" ? limit : 10
    );

    return NextResponse.json(filings);
  } catch (error) {
    log.error("Failed to fetch SEC filings", error, "EdgarAPI");
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
