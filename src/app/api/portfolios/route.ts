import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { CreatePortfolioRequest } from "@/features/ai/agents/types";
import { getServerUser } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const portfolios = await agentService.getAllPortfolios(user.uid);
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
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const portfolioRequest: CreatePortfolioRequest = body;

    const portfolio = await agentService.createPortfolio(
      portfolioRequest,
      user.uid
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
