import { NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";

export async function GET() {
  try {
    const positions = await alpacaService.getPositions();
    return NextResponse.json({ positions });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Alpaca positions";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
