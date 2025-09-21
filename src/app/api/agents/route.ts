import { agentService } from "@/features/ai/agents/services/agent-service";
import { CreateAgentRequest } from "@/features/ai/agents/types";
import { NextRequest, NextResponse } from "next/server";

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
