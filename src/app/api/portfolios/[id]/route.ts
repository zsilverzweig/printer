import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { UpdatePortfolioRequest } from "@/features/ai/agents/types";
import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const portfolio = await agentService.getPortfolio(params.id);
    if (!portfolio) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    // Verify portfolio belongs to the authenticated user
    if (portfolio.userId !== user.uid) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ portfolio });
  } catch (error) {
    log.failure("Failed to fetch portfolio", error, "PortfoliosAPI");
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify portfolio exists and belongs to user
    const existingPortfolio = await agentService.getPortfolio(params.id);
    if (!existingPortfolio || existingPortfolio.userId !== user.uid) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updateRequest: UpdatePortfolioRequest = body;

    const portfolio = await agentService.updatePortfolio(
      params.id,
      updateRequest
    );
    return NextResponse.json({ portfolio });
  } catch (error) {
    log.failure("Failed to update portfolio", error, "PortfoliosAPI");
    return NextResponse.json(
      { error: "Failed to update portfolio" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify portfolio exists and belongs to user
    const existingPortfolio = await agentService.getPortfolio(params.id);
    if (!existingPortfolio || existingPortfolio.userId !== user.uid) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    await agentService.deletePortfolio(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.failure("Failed to delete portfolio", error, "PortfoliosAPI");
    return NextResponse.json(
      { error: "Failed to delete portfolio" },
      { status: 500 }
    );
  }
}
