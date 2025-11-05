"""
Alpaca WebSocket Client

Manages WebSocket connection to Alpaca trade_updates stream.
Handles authentication, subscription, and auto-reconnect with exponential backoff.
"""

import asyncio
import json
import logging
import os
from typing import Optional
from datetime import datetime

import websockets
from websockets.client import WebSocketClientProtocol

from app.services.trading.alpaca_service import AlpacaService

logger = logging.getLogger(__name__)


class AlpacaWebSocketClient:
    """
    Manages WebSocket connection to Alpaca trade_updates stream.
    Reconnects automatically on disconnect with exponential backoff.
    """
    
    def __init__(
        self,
        alpaca_service: AlpacaService,
        event_handler,  # TradeEventHandler (forward reference to avoid circular import)
        paper_trading: bool = True
    ):
        """
        Initialize WebSocket client.
        
        Args:
            alpaca_service: AlpacaService instance
            event_handler: TradeEventHandler instance to process events
            paper_trading: If True, use paper trading WebSocket endpoint
        """
        self.alpaca_service = alpaca_service
        self.event_handler = event_handler
        self.paper_trading = paper_trading
        
        # WebSocket configuration
        if paper_trading:
            self.ws_url = "wss://paper-api.alpaca.markets/stream"
        else:
            self.ws_url = "wss://api.alpaca.markets/stream"
        
        # Connection state
        self.ws: Optional[WebSocketClientProtocol] = None
        self.is_running = False
        self.reconnect_attempt = 0
        self.max_reconnect_delay = 60  # Max 60 seconds
        
        # Get API credentials
        if paper_trading:
            self.api_key = os.getenv("ALPACA_API_KEY")
            self.secret_key = os.getenv("ALPACA_SECRET_KEY")
        else:
            self.api_key = os.getenv("ALPACA_REAL_API_KEY")
            self.secret_key = os.getenv("ALPACA_REAL_SECRET_KEY")
    
    async def connect(self) -> None:
        """Start the WebSocket connection and listening loop."""
        if self.is_running:
            logger.warning("WebSocket client already running")
            return
        
        if not self.api_key or not self.secret_key:
            logger.error(
                f"Alpaca API credentials not found for {'paper' if self.paper_trading else 'real'} trading. "
                "WebSocket connection will not be established."
            )
            return
        
        self.is_running = True
        logger.info(
            f"🔌 Starting Alpaca WebSocket client ({'paper' if self.paper_trading else 'real'} trading)"
        )
        
        # Start listening loop (handles reconnection internally)
        asyncio.create_task(self._listen_loop())
    
    async def disconnect(self) -> None:
        """Stop the WebSocket connection."""
        logger.info("🔌 Stopping Alpaca WebSocket client")
        self.is_running = False
        
        if self.ws:
            try:
                await self.ws.close()
            except Exception as e:
                logger.warning(f"Error closing WebSocket: {e}")
            self.ws = None
    
    async def _listen_loop(self) -> None:
        """Main listening loop with auto-reconnect."""
        while self.is_running:
            try:
                await self._connect_and_listen()
            except Exception as e:
                logger.error(f"WebSocket error in listen loop: {e}", exc_info=True)
                
                if self.is_running:
                    # Wait before reconnecting (exponential backoff)
                    delay = min(2 ** self.reconnect_attempt, self.max_reconnect_delay)
                    self.reconnect_attempt += 1
                    logger.info(f"⏳ Reconnecting in {delay} seconds (attempt {self.reconnect_attempt})...")
                    await asyncio.sleep(delay)
                else:
                    break
        
        logger.info("🔌 WebSocket listen loop ended")
    
    async def _connect_and_listen(self) -> None:
        """Connect to WebSocket, authenticate, subscribe, and listen for messages."""
        try:
            # Connect to WebSocket
            logger.info(f"🔌 Connecting to {self.ws_url}...")
            self.ws = await websockets.connect(
                self.ws_url,
                ping_interval=20,  # Ping every 20 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
            )
            logger.debug("WebSocket connected")
            self.reconnect_attempt = 0  # Reset on successful connection
            
            # Authenticate
            await self._authenticate()
            
            # Subscribe to trade_updates
            await self._subscribe_trade_updates()
            
            # Listen for messages
            async for message in self.ws:
                if not self.is_running:
                    break
                
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse WebSocket message: {e}")
                except Exception as e:
                    logger.error(f"Error handling WebSocket message: {e}", exc_info=True)
            
        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"WebSocket connection closed: {e}")
            raise
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}", exc_info=True)
            raise
        finally:
            if self.ws:
                try:
                    await self.ws.close()
                except Exception:
                    pass
                self.ws = None
    
    async def _authenticate(self) -> None:
        """Send authentication message to WebSocket."""
        auth_message = {
            "action": "auth",
            "key": self.api_key,
            "secret": self.secret_key
        }
        
        logger.debug("🔐 Authenticating WebSocket...")
        await self.ws.send(json.dumps(auth_message))
        
        # Wait for auth response
        response = await self.ws.recv()
        data = json.loads(response)
        
        if data.get("stream") == "authorization" and data.get("data", {}).get("status") == "authorized":
            logger.debug("WebSocket authenticated")
        else:
            raise Exception(f"WebSocket authentication failed: {data}")
    
    async def _subscribe_trade_updates(self) -> None:
        """Subscribe to trade_updates stream."""
        subscribe_message = {
            "action": "listen",
            "data": {
                "streams": ["trade_updates"]
            }
        }
        
        logger.debug("📡 Subscribing to trade_updates stream...")
        await self.ws.send(json.dumps(subscribe_message))
        
        # Wait for subscription confirmation
        response = await self.ws.recv()
        data = json.loads(response)
        
        if data.get("stream") == "listening":
            streams = data.get("data", {}).get("streams", [])
            if "trade_updates" in streams:
                logger.debug("Subscribed to trade_updates stream")
            else:
                logger.warning(f"⚠️  trade_updates not in subscribed streams: {streams}")
        else:
            logger.warning(f"⚠️  Unexpected response to subscribe: {data}")
    
    async def _handle_message(self, data: dict) -> None:
        """Handle incoming WebSocket message."""
        stream = data.get("stream")
        
        if stream == "trade_updates":
            # Pass event data to event handler
            event_data = data.get("data", {})
            if event_data:
                try:
                    await self.event_handler.handle_trade_update(event_data)
                except Exception as e:
                    logger.error(
                        f"Error processing trade_update event: {e}",
                        exc_info=True
                    )
        elif stream == "authorization":
            # Handle authorization messages
            status = data.get("data", {}).get("status")
            if status == "unauthorized":
                logger.error("❌ WebSocket authorization revoked")
        elif stream == "listening":
            # Subscription confirmation (already handled)
            pass
        else:
            logger.debug(f"Received WebSocket message on stream '{stream}': {data}")
