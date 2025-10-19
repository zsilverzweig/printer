import type { NextRequest } from "next/server";

// WebSocket upgrade handler provided by next-ws (patched in prepare script)
export function UPGRADE(
  client: import("ws").WebSocket,
  _server: import("ws").WebSocketServer,
  _request: NextRequest
) {
  const apiKey = process.env.POLY_API_KEY;
  const upstreamUrl = "wss://delayed.polygon.io/stocks";

  const upstream = new (require("ws").WebSocket)(upstreamUrl);

  upstream.on("open", () => {
    if (apiKey)
      upstream.send(JSON.stringify({ action: "auth", params: apiKey }));
    upstream.send(JSON.stringify({ action: "subscribe", params: "AM.*" }));
  });

  // Forward messages from upstream to browser
  upstream.on("message", (data: import("ws").RawData) => {
    try {
      client.send(data);
    } catch {}
  });
  upstream.on("close", () => {
    try {
      client.close();
    } catch {}
  });
  upstream.on("error", () => {
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
  client.on("close", () => {
    try {
      upstream.close();
    } catch {}
  });
}

