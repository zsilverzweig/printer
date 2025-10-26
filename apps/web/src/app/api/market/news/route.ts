import { NextRequest } from "next/server";

import { log } from "@/lib/utils/logger";

function getBaseUrl(): string {
  // Server-side env var; falls back to local dev
  return process.env.MARKET_API_BASE_URL || "http://localhost:8000";
}

export async function GET(request: NextRequest) {
  try {
    const base = getBaseUrl().replace(/\/$/, "");
    const query = request.nextUrl.search || "";
    const targetUrl = `${base}/api/news${query}`;

    log.info("[NewsProxy] forwarding", { targetUrl, query }, "MarketAPI");

    const startTime = Date.now();
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: new Headers({
        "Content-Type":
          request.headers.get("content-type") || "application/json",
        Accept: request.headers.get("accept") || "application/json",
      }),
      cache: "no-store",
    });

    const body = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json";
    const duration = Date.now() - startTime;

    log.info(
      "[NewsProxy] upstream response",
      {
        status: upstream.status,
        contentType,
        duration: `${duration}ms`,
        bodyLength: body.length,
        bodyPreview: body.substring(0, 200) + (body.length > 200 ? "..." : ""),
      },
      "MarketAPI"
    );

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    log.error(
      "[NewsProxy] upstream fetch failed",
      error instanceof Error ? error.message : String(error),
      "MarketAPI"
    );
    return new Response(
      JSON.stringify({ error: "Upstream market server unavailable" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
