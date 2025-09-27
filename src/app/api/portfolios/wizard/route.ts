import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `wizard_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 6)}`;

  try {
    log.info(
      "Portfolio wizard request started",
      { requestId },
      "PortfolioWizardAPI"
    );

    const body = await request.json();
    const thesis = typeof body.thesis === "string" ? body.thesis : "";
    const name = typeof body.name === "string" ? body.name : undefined;
    const description =
      typeof body.description === "string" ? body.description : undefined;

    log.info(
      "Portfolio wizard request parsed",
      {
        requestId,
        hasThesis: !!thesis.trim(),
        thesisLength: thesis.length,
        hasName: !!name?.trim(),
        hasDescription: !!description?.trim(),
      },
      "PortfolioWizardAPI"
    );

    if (!thesis.trim()) {
      log.warn(
        "Portfolio wizard request rejected - no thesis",
        { requestId },
        "PortfolioWizardAPI"
      );
      return NextResponse.json(
        { error: "Thesis is required" },
        { status: 400 }
      );
    }

    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      log.warn(
        "Portfolio wizard request rejected - no authentication",
        { requestId },
        "PortfolioWizardAPI"
      );
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const userId = user.uid;

    log.info(
      "Starting portfolio draft generation",
      {
        requestId,
        userId,
        thesisPreview:
          thesis.substring(0, 100) + (thesis.length > 100 ? "..." : ""),
      },
      "PortfolioWizardAPI"
    );

    const portfolio = await agentService.createPortfolioDraftFromThesis(
      thesis,
      userId,
      {
        name: name?.trim() || undefined,
        description: description?.trim() || undefined,
      }
    );

    const duration = Date.now() - startTime;
    log.success(
      "Portfolio wizard request completed successfully",
      {
        requestId,
        duration,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        positionCount: portfolio.positions.length,
      },
      "PortfolioWizardAPI"
    );

    return NextResponse.json({
      portfolio,
      metadata: {
        requestId,
        duration,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.failure(
      "Failed to generate portfolio draft",
      {
        error,
        requestId,
        duration,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      "PortfolioWizardAPI"
    );
    return NextResponse.json(
      {
        error: "Failed to generate portfolio draft",
        requestId,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
