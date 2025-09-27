import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { companyResearchService } from "@/features/research/company/services/company-research-service";

/**
 * Individual Company Research API Endpoints
 * 
 * GET: Fetch specific research by ID
 * PUT: Update research (admin only)
 * DELETE: Delete research
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const research = await companyResearchService.getResearch(params.id);
    if (!research) {
      return NextResponse.json(
        { error: "Research not found" },
        { status: 404 }
      );
    }

    // Verify research belongs to user (or user is admin)
    if (research.userId !== user.uid && user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: "Research not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ research });
  } catch (error) {
    console.error("Failed to fetch research:", error);
    return NextResponse.json(
      { error: "Failed to fetch research" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get research to verify ownership
    const research = await companyResearchService.getResearch(params.id);
    if (!research) {
      return NextResponse.json(
        { error: "Research not found" },
        { status: 404 }
      );
    }

    // Verify research belongs to user (or user is admin)
    if (research.userId !== user.uid && user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: "Research not found" },
        { status: 404 }
      );
    }

    await companyResearchService.deleteResearch(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete research:", error);
    return NextResponse.json(
      { error: "Failed to delete research" },
      { status: 500 }
    );
  }
}
