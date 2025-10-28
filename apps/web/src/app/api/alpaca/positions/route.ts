import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("http://server:8000/api/trading/positions");
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Alpaca positions";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
