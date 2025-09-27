import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { companyResearchService } from "@/features/research/company/services/company-research-service";
import { CreateCompanyResearchRequest } from "@/features/research/company/types";

/**
 * Company Research API Endpoints
 * 
 * GET: Fetch all company research for authenticated user
 * POST: Create new company research with agent assignment
 */

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

    const research = await companyResearchService.getAllResearch(user.uid);
    return NextResponse.json({ research });
  } catch (error) {
    console.error("Failed to fetch company research:", error);
    return NextResponse.json(
      { error: "Failed to fetch company research" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("Company research API POST request received");
    
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      console.log("Authentication failed - no user found");
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    console.log("User authenticated:", { userId: user.uid, userRole: user.role });

    const body = await request.json();
    const researchRequest: CreateCompanyResearchRequest = body;

    console.log("Research request parsed:", researchRequest);

    // Validate required fields
    if (!researchRequest.companyTicker) {
      console.log("Validation failed - no company ticker provided");
      return NextResponse.json(
        { error: "Company ticker is required" },
        { status: 400 }
      );
    }

    console.log("Calling companyResearchService.createResearch");

    // Create the research
    const research = await companyResearchService.createResearch(
      researchRequest,
      user.uid,
      user
    );

    console.log("Research created successfully:", { 
      researchId: research.id, 
      companyTicker: research.companyTicker,
      status: research.status 
    });

    return NextResponse.json({ research });
  } catch (error) {
    console.error("Failed to create company research:", error);
    return NextResponse.json(
      { 
        error: "Failed to create company research",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
