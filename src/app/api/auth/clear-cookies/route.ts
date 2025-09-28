import { NextRequest, NextResponse } from "next/server";

import { clearServerUser } from "@/lib/auth/server";

/**
 * API route to clear server-side authentication cookies
 * Called by the client-side auth service during sign out
 */
export async function POST(request: NextRequest) {
  try {
    // Clear server-side cookies using our server auth utilities
    await clearServerUser();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing server cookies:", error);
    return NextResponse.json(
      { error: "Failed to clear server cookies" },
      { status: 500 }
    );
  }
}


