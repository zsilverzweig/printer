"""WebSocket broadcasting logic for screener service."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Set

from fastapi.encoders import jsonable_encoder


class ScreenerBroadcaster:
    """Handles broadcasting screener results to WebSocket subscribers."""
    
    def __init__(self):
        self.logger = logging.getLogger("app.screener.broadcast")
        self.subscribers: Set[Any] = set()
        self.cached_payload: list[dict] = []
    
    def add_subscriber(self, websocket: Any) -> None:
        """Add a WebSocket subscriber."""
        self.subscribers.add(websocket)
        self.logger.info(f"Added screener subscriber (total: {len(self.subscribers)})")
    
    def remove_subscriber(self, websocket: Any) -> None:
        """Remove a WebSocket subscriber."""
        self.subscribers.discard(websocket)
        self.logger.info(f"Removed screener subscriber (total: {len(self.subscribers)})")
    
    async def broadcast(self, payload: list[dict]) -> None:
        """Broadcast screener results to all subscribers.
        
        Args:
            payload: List of screener result dictionaries to broadcast
        """
        self.cached_payload = payload
        
        # Wrap in message envelope for unified WebSocket
        msg = {
            "type": "screener_update",
            "data": jsonable_encoder(payload),
            "timestamp": int(time.time() * 1000)
        }
        
        self.logger.info(
            "Broadcasting payload to %s subscribers; payload_length=%s; first_3=%s",
            len(self.subscribers),
            len(payload),
            payload[:3] if payload else [],
        )
        
        # Broadcast to subscribers with error handling and cleanup
        dead_connections = []
        for ws in list(self.subscribers):
            try:
                # Check if websocket is in a valid state before sending
                if hasattr(ws, 'client_state') and hasattr(ws, 'application_state'):
                    # FastAPI WebSocket has client_state and application_state
                    from starlette.websockets import WebSocketState
                    if ws.client_state != WebSocketState.CONNECTED or ws.application_state != WebSocketState.CONNECTED:
                        self.logger.debug("Removing disconnected websocket from screener subscribers")
                        dead_connections.append(ws)
                        continue
                
                # Send as JSON object for unified endpoint, text for legacy endpoints
                try:
                    await ws.send_json(msg)
                except (TypeError, AttributeError):
                    # Fallback to text for legacy endpoints
                    await ws.send_text(json.dumps(msg))
            except Exception as e:
                self.logger.warning("Failed to send to screener subscriber: %s", e)
                dead_connections.append(ws)
        
        # Clean up dead connections
        for ws in dead_connections:
            self.subscribers.discard(ws)
    
    def get_cached_payload(self) -> list[dict]:
        """Get the most recently cached payload."""
        return self.cached_payload

