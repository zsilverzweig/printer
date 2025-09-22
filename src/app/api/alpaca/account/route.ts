import { NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";

export async function GET() {
  try {
    const account = await alpacaService.getAccount();
    return NextResponse.json({ account });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Alpaca account details";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
