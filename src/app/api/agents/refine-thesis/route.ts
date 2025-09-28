import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";
import { aiService, createAIRequest } from "@/lib/services/ai-service";
import { withSecurity, aiRequestSecurity } from "@/lib/services/security-wrapper";

import { PortfolioManagerAgent, RefineThesisInput, RefineThesisOutput } from "@/features/agents/portfolio-manager";

export const POST = withSecurity(aiRequestSecurity, async (request: NextRequest) => {
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

    // Create AI request
    const aiRequest = createAIRequest(
      PortfolioManagerAgent.id,
      PortfolioManagerAgent.jobs.refineThesis.prompt({ thesis }),
      user.uid
    );

    // Execute with AI service - pass agent directly
    const response = await aiService.generateResponse(PortfolioManagerAgent, aiRequest, "thesis_generation");
    
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
    if (!result.thesis_title || !result.thesis_description || !result.thesis) {
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
      thesisLength: result.thesis.length,
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
});
