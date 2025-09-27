import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { companyResearchService } from "@/features/research/company/services/company-research-service";

/**
 * Company Research Search API
 * 
 * POST: Search research using semantic vector search
 */

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    // Perform semantic search
    const research = await companyResearchService.searchResearch(query, user.uid);
    
    return NextResponse.json({ research });
  } catch (error) {
    console.error("Failed to search research:", error);
    return NextResponse.json(
      { error: "Failed to search research" },
      { status: 500 }
    );
  }
}
