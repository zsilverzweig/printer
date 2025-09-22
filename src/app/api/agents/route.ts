import { NextRequest, NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { CreateAgentRequest } from "@/features/ai/agents/types";

export async function GET() {
  try {
    const agents = await agentService.getAllAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agentRequest: CreateAgentRequest = body;

    // Validate required fields
    if (
      !agentRequest.name ||
      !agentRequest.description ||
      !agentRequest.role ||
      !agentRequest.promptGuidance
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: name, description, role, and promptGuidance are required",
        },
        { status: 400 }
      );
    }

    // TODO: Get actual user ID from authentication
    const userId = "current-user";

    const agent = await agentService.createAgent(agentRequest, userId);
    return NextResponse.json({ agent });
  } catch (error) {
    console.error("Failed to create agent:", error);
    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
