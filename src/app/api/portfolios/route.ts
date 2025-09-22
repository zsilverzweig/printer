import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { CreatePortfolioRequest } from "@/features/ai/agents/types";

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

    const portfolios = await agentService.getAllPortfolios(userId);
    return NextResponse.json({ portfolios });
  } catch (error) {
    console.error("Failed to fetch portfolios:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolios" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const portfolioRequest: CreatePortfolioRequest = body;

    // TODO: Get actual user ID from authentication
    const userId = "current-user";

    const portfolio = await agentService.createPortfolio(
      portfolioRequest,
      userId
    );
    return NextResponse.json({ portfolio });
  } catch (error) {
    console.error("Failed to create portfolio:", error);
    return NextResponse.json(
      { error: "Failed to create portfolio" },
      { status: 500 }
    );
  }
}
