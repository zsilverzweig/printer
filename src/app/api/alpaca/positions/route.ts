import { NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";
import { getServerUser } from "@/lib/auth/server";

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const positions = await alpacaService.getPositions(user.uid, "paper");
    return NextResponse.json({ positions });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Alpaca positions";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
