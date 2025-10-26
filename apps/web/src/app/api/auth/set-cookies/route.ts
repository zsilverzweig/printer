import { NextRequest, NextResponse } from "next/server";

import { setServerUser } from "@/lib/auth/server";

/**
 * API route to set server-side authentication cookies
 * Called by the client-side auth service after successful authentication
 */
export async function POST(request: NextRequest) {
  try {
    const { user, token } = await request.json();

    if (!user || !token) {
      return NextResponse.json(
        { error: "Missing user data or token" },
        { status: 400 }
      );
    }

    // Set server-side cookies using our server auth utilities
    await setServerUser(user, token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting server cookies:", error);
    return NextResponse.json(
      { error: "Failed to set server cookies" },
      { status: 500 }
    );
  }
}


