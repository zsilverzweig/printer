import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { agentId } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "Agent ID is required" },
        { status: 400 }
      );
    }

    // TODO: Get actual user ID from authentication
    const userId = "current-user";

    const work = await agentService.executeWork(params.id, agentId, userId);
    return NextResponse.json({ work });
  } catch (error) {
    console.error("Failed to execute work:", error);
    return NextResponse.json(
      { error: "Failed to execute work" },
      { status: 500 }
    );
  }
}
