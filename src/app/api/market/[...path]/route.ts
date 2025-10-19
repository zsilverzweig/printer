import { NextRequest } from "next/server";

function getBaseUrl(): string {
  // Server-side env var; falls back to local dev
  return process.env.MARKET_API_BASE_URL || "http://localhost:8000";
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const base = getBaseUrl().replace(/\/$/, "");
  const targetPath = path.join("/");
  const query = request.nextUrl.search || "";
  const targetUrl = `${base}/${targetPath}${query}`;

  const init: RequestInit = {
    method: request.method,
    // Forward body when appropriate
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.text(),
    headers: new Headers({
      "Content-Type": request.headers.get("content-type") || "application/json",
      // You may forward additional headers if needed
    }),
    // credentials are not forwarded cross-origin; this is server-to-server
  };

  const upstream = await fetch(targetUrl, init);
  const body = await upstream.text();

  // Pass through content-type if present, default to JSON
  const contentType =
    upstream.headers.get("content-type") || "application/json";
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
      // No CORS headers needed; this route is same-origin for the browser
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(request, params.path || []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(request, params.path || []);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(request, params.path || []);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(request, params.path || []);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(request, params.path || []);
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Preflight handled same-origin; respond OK
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
