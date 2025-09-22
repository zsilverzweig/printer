import { NextResponse } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";

export async function GET() {
  try {
    const templates = await agentService.getTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to fetch templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}
