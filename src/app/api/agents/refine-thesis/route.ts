import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";
import { aiService, createAIRequest, AIAgent } from "@/lib/services/ai-service";

import { PortfolioManagerAgent, RefineThesisInput, RefineThesisOutput } from "@/features/agents/portfolio-manager";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thesis } = body;

    // Basic input validation
    if (!thesis || typeof thesis !== "string" || !thesis.trim()) {
      return NextResponse.json(
        { error: "Thesis is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    log.info("Refine thesis request", {
      userId: user.uid,
      thesisLength: thesis.length
    }, "RefineThesisAPI");

    // Create AI agent from our agent definition
    const agent: AIAgent = {
      id: PortfolioManagerAgent.id,
      name: PortfolioManagerAgent.name,
      description: PortfolioManagerAgent.description,
      systemPrompt: PortfolioManagerAgent.systemPrompt,
      model: {
        name: PortfolioManagerAgent.model.name,
        temperature: PortfolioManagerAgent.model.temperature,
        maxTokens: PortfolioManagerAgent.model.maxTokens,
      },
    };

    // Create AI request
    const aiRequest = createAIRequest(
      agent.id,
      PortfolioManagerAgent.jobs.refineThesis.prompt({ thesis }),
      user.uid
    );

    // Execute with AI service
    const response = await aiService.generateResponse(agent, aiRequest, "thesis_generation");
    
    // Parse JSON response
    let result: RefineThesisOutput;
    try {
      result = JSON.parse(response.content);
    } catch (parseError) {
      log.error("Failed to parse AI response as JSON", { content: response.content }, "RefineThesisAPI");
      return NextResponse.json(
        { error: "AI response is not valid JSON" },
        { status: 500 }
      );
    }

    // Basic output validation
    if (!result.thesis_title || !result.thesis_description || !result.rationale) {
      log.error("AI response missing required fields", { result }, "RefineThesisAPI");
      return NextResponse.json(
        { error: "AI response is missing required fields" },
        { status: 500 }
      );
    }

    log.success("Thesis refinement completed", {
      userId: user.uid,
      titleLength: result.thesis_title.length,
      descriptionLength: result.thesis_description.length,
      tokensUsed: response.tokensUsed.totalTokens,
      cost: response.cost
    }, "RefineThesisAPI");

    return NextResponse.json(result);
  } catch (error) {
    log.error("Failed to refine thesis", error, "RefineThesisAPI");
    return NextResponse.json(
      { error: "Failed to refine thesis" },
      { status: 500 }
    );
  }
}
