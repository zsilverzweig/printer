import { NextRequest } from "next/server";

function getBaseUrl(): string {
  // Use API_URL for server-side calls (set to http://server:8000 in Docker)
  // Falls back to NEXT_PUBLIC_API_URL or localhost for local development
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  );
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const base = getBaseUrl().replace(/\/$/, "");
  const targetPath = path.join("/");
  const query = request.nextUrl.search || "";
  const targetUrl = `${base}/api/admin/${targetPath}${query}`;

  const init: RequestInit = {
    method: request.method,
    // Forward body when appropriate
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.text(),
    headers: new Headers({
      "Content-Type": request.headers.get("content-type") || "application/json",
      // Forward authentication headers if needed
      ...(request.headers.get("authorization") && {
        Authorization: request.headers.get("authorization")!,
      }),
    }),
  };

  try {
    const upstream = await fetch(targetUrl, init);
    const body = await upstream.text();

    // Pass through content-type if present, default to JSON
    const contentType =
      upstream.headers.get("content-type") || "application/json";
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    console.error(`Failed to proxy admin request to ${targetUrl}:`, error);
    return new Response(
      JSON.stringify({
        error: "Failed to connect to backend server",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }
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
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
