import type { NextRequest } from "next/server";

import { log } from "@/lib/utils/logger";

export const runtime = "nodejs";

// WebSocket upgrade handler provided by next-ws (patched in prepare script)
export function UPGRADE(
  client: import("ws").WebSocket,
  _server: import("ws").WebSocketServer,
  request: NextRequest
) {
  try {
    log.debug("[WS] upgrade start", {
      url: request.url,
      ua: request.headers.get("user-agent"),
      nodeEnv: process.env.NODE_ENV,
      nextPhase: process.env.NEXT_PHASE,
      isDev: process.env.NODE_ENV === "development",
    });
  } catch {}

  const apiKey = process.env.POLY_API_KEY;
  const upstreamUrl = "wss://delayed.polygon.io/stocks";
  let subs = "AM.*";

  try {
    const reqUrl = new URL(request.url);
    const qSubs = reqUrl.searchParams.get("subs");
    if (qSubs && qSubs.trim().length > 0) subs = qSubs.trim();
    log.debug("[WS] requested subs", { subs });
  } catch {}

  try {
    log.debug("[WS] upstream connect", { upstreamUrl });
  } catch {}

  const upstream = new (require("ws").WebSocket)(upstreamUrl);

  upstream.on("open", () => {
    if (apiKey)
      upstream.send(JSON.stringify({ action: "auth", params: apiKey }));
    try {
      log.info("[WS] upstream open", { subs });
    } catch {}
    upstream.send(JSON.stringify({ action: "subscribe", params: subs }));

    // Proactively tell the browser client we're alive
    try {
      client.send(
        JSON.stringify({ type: "ws_server_hello", ts: Date.now(), subs })
      );
    } catch {}
  });

  // Forward messages from upstream to browser
  upstream.on("message", (data: import("ws").RawData) => {
    try {
      // Optionally decode small frames for visibility
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            const first = parsed[0];
            if (first?.status || first?.message) {
              log.debug("[WS] upstream msg", { first });
            }
          }
        } catch {}
      }
      client.send(data);
    } catch {}
  });
  upstream.on("close", (code: number, reason: Buffer) => {
    try {
      log.info("[WS] upstream close", {
        code,
        reason:
          typeof reason?.toString === "function"
            ? reason.toString()
            : undefined,
      });
    } catch {}
    try {
      client.close();
    } catch {}
  });
  upstream.on("error", (err: unknown) => {
    try {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("[WS] upstream error", { message });
    } catch {}
    try {
      client.close();
    } catch {}
  });

  // Forward messages from browser to upstream (allow client to subscribe/unsubscribe)
  client.on("message", (data) => {
    try {
      upstream.send(data);
    } catch {}
  });
  client.on("close", (code: number, reason: Buffer) => {
    try {
      log.info("[WS] client close", {
        code,
        reason:
          typeof reason?.toString === "function"
            ? reason.toString()
            : undefined,
      });
    } catch {}
    try {
      upstream.close();
    } catch {}
  });
  client.on("error", (err: unknown) => {
    try {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("[WS] client error", { message });
    } catch {}
    try {
      // If the client reports an error during upgrade, provide a hint
      client.send(
        JSON.stringify({
          type: "ws_server_notice",
          ts: Date.now(),
          message: "Server observed client error; connection may be unstable.",
        })
      );
    } catch {}
  });
}
