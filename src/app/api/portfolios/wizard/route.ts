import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { log } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const thesis = typeof body.thesis === "string" ? body.thesis : "";
    const name = typeof body.name === "string" ? body.name : undefined;
    const description =
      typeof body.description === "string" ? body.description : undefined;

    if (!thesis.trim()) {
      return NextResponse.json(
        { error: "Thesis is required" },
        { status: 400 }
      );
    }

    // TODO: Replace with authenticated user ID once auth is integrated server-side
    const userId = "current-user";

    const portfolio = await agentService.createPortfolioDraftFromThesis(
      thesis,
      userId,
      {
        name: name?.trim() || undefined,
        description: description?.trim() || undefined,
      }
    );

    return NextResponse.json({ portfolio });
  } catch (error) {
    log.failure(
      "Failed to generate portfolio draft",
      error,
      "PortfolioWizardAPI"
    );
    return NextResponse.json(
      { error: "Failed to generate portfolio draft" },
      { status: 500 }
    );
  }
}
