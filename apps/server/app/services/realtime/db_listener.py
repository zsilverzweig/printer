"""
Database Listener Service for PostgreSQL NOTIFY/LISTEN.

Listens to PostgreSQL notification channels and broadcasts changes
to WebSocket subscribers organized by fund_id.
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, Set
from fastapi import WebSocket

import asyncpg
from sqlalchemy import text

from app.services.core.database import get_async_engine


logger = logging.getLogger(__name__)


class DatabaseListenerService:
    """
    Service that listens to PostgreSQL NOTIFY events and broadcasts
    to WebSocket clients organized by fund_id.
    """
    
    def __init__(self):
        self.connection: asyncpg.Connection | None = None
        self._engine_conn = None
        self.subscribers: Dict[str, Set[WebSocket]] = {}  # fund_id -> set of websockets
        self.running = False
        self._listen_task: asyncio.Task | None = None
        self._channels = (
            "fund_orders_changed",
            "fund_transactions_changed",
            "fund_transfers_changed",
            "fund_balance_changed",
        )
        
    async def start(self):
        """Start the database listener service."""
        if self.running:
            logger.warning("DatabaseListenerService is already running")
            return

        # Get database URL from environment
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is not set")

        logger.info("Starting DatabaseListenerService...")
        self.running = True

        try:
            await self._connect()
            self._listen_task = asyncio.create_task(self._keep_alive_loop())
        except Exception as e:
            logger.error(f"❌ Failed to start DatabaseListenerService: {e}")
            self.running = False
            raise
    
    async def stop(self):
        """Stop the database listener service."""
        if not self.running:
            return
            
        logger.info("Stopping DatabaseListenerService...")
        self.running = False
        
        # Cancel keep-alive task
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        
        await self._close_connection()
        
        # Clear subscribers
        self.subscribers.clear()
        
        logger.info("✅ DatabaseListenerService stopped")
    
    async def _keep_alive_loop(self):
        """Keep the connection alive and handle reconnection."""
        while self.running:
            try:
                # Sleep for 30 seconds
                await asyncio.sleep(30)
                
                # Send a simple query to keep connection alive
                if self.connection:
                    await self.connection.execute("SELECT 1")
                else:
                    await self._connect()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Connection keep-alive error: {e}")
                await self._close_connection()
                if self.running:
                    try:
                        await self._connect()
                    except Exception as reconnect_error:
                        logger.error(f"Reconnection failed: {reconnect_error}")
                        await asyncio.sleep(5)

    async def _connect(self) -> None:
        """Establish a LISTEN/NOTIFY connection."""
        await self._close_connection()

        engine = get_async_engine()
        self._engine_conn = await engine.connect()
        await self._engine_conn.execution_options(isolation_level="AUTOCOMMIT")
        raw_connection = await self._engine_conn.get_raw_connection()
        self.connection = raw_connection.driver_connection
        logger.info("✅ Connected to PostgreSQL for LISTEN/NOTIFY")

        handlers = self._listener_handlers()
        for channel, handler in handlers.items():
            await self.connection.add_listener(channel, handler)
        logger.info("✅ Subscribed to all notification channels")

    async def _close_connection(self) -> None:
        """Cleanly close the LISTEN/NOTIFY connection."""
        handlers = self._listener_handlers()
        if self.connection:
            for channel, handler in handlers.items():
                try:
                    await self.connection.remove_listener(channel, handler)
                except Exception:
                    pass
            try:
                await self.connection.close()
            except Exception:
                pass
            self.connection = None
        if self._engine_conn:
            try:
                await self._engine_conn.close()
            except Exception:
                pass
            self._engine_conn = None

    def _listener_handlers(self) -> Dict[str, Any]:
        """Return mapping of channel names to handler callbacks."""
        return {
            "fund_orders_changed": self._handle_orders_notification,
            "fund_transactions_changed": self._handle_transactions_notification,
            "fund_transfers_changed": self._handle_transfers_notification,
            "fund_balance_changed": self._handle_balance_notification,
        }
    
    def subscribe(self, fund_id: str, websocket: WebSocket):
        """Subscribe a WebSocket to updates for a specific fund."""
        if fund_id not in self.subscribers:
            self.subscribers[fund_id] = set()
        
        self.subscribers[fund_id].add(websocket)
        logger.debug(f"WebSocket subscribed to fund {fund_id}. Total subscribers: {len(self.subscribers[fund_id])}")
    
    def unsubscribe(self, fund_id: str, websocket: WebSocket):
        """Unsubscribe a WebSocket from updates for a specific fund."""
        if fund_id in self.subscribers:
            self.subscribers[fund_id].discard(websocket)
            
            # Clean up empty sets
            if not self.subscribers[fund_id]:
                del self.subscribers[fund_id]
            
            logger.debug(f"WebSocket unsubscribed from fund {fund_id}. Remaining: {len(self.subscribers.get(fund_id, []))}")
    
    async def _broadcast_to_fund(self, fund_id: str, message: dict):
        """Broadcast a message to all WebSocket subscribers for a fund."""
        if fund_id not in self.subscribers:
            return

        # Ensure downstream consumers receive the fund id and correct type
        enriched_message = {
            "type": "fund_update",
            "fund_id": fund_id,
            **message,
        }

        # Get copy of subscribers to avoid modification during iteration
        subscribers = list(self.subscribers[fund_id])

        # Track disconnected clients
        disconnected = []

        for websocket in subscribers:
            try:
                # Check if websocket is still connected before sending
                from starlette.websockets import WebSocketState
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.debug("WebSocket not connected, skipping broadcast")
                    disconnected.append(websocket)
                    continue

                await websocket.send_json(enriched_message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.append(websocket)

        # Clean up disconnected clients
        for websocket in disconnected:
            self.unsubscribe(fund_id, websocket)
    
    async def _handle_orders_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_orders_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Order notification for fund {fund_id}: {data.get('event_type')}")
                await self._broadcast_to_fund(
                    fund_id,
                    {
                        "category": "orders",
                        "event_type": data.get("event_type"),
                        "timestamp": data.get("timestamp"),
                        "data": data.get("data"),
                    },
                )
        except Exception as e:
            logger.error(f"Error handling order notification: {e}")
    
    async def _handle_transactions_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_transactions_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Transaction notification for fund {fund_id}: {data.get('event_type')}")
                await self._broadcast_to_fund(
                    fund_id,
                    {
                        "category": "transactions",
                        "event_type": data.get("event_type"),
                        "timestamp": data.get("timestamp"),
                        "data": data.get("data"),
                    },
                )
        except Exception as e:
            logger.error(f"Error handling transaction notification: {e}")
    
    async def _handle_transfers_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_transfers_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Transfer notification for fund {fund_id}: {data.get('event_type')}")
                await self._broadcast_to_fund(
                    fund_id,
                    {
                        "category": "transfers",
                        "event_type": data.get("event_type"),
                        "timestamp": data.get("timestamp"),
                        "data": data.get("data"),
                    },
                )
        except Exception as e:
            logger.error(f"Error handling transfer notification: {e}")
    
    async def _handle_balance_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_balance_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Balance notification for fund {fund_id}: {data.get('data', {}).get('balance')}")
                await self._broadcast_to_fund(
                    fund_id,
                    {
                        "category": "balance",
                        "event_type": data.get("event_type"),
                        "timestamp": data.get("timestamp"),
                        "data": data.get("data"),
                    },
                )
        except Exception as e:
            logger.error(f"Error handling balance notification: {e}")


# Global instance
_db_listener_service: DatabaseListenerService | None = None


def get_db_listener_service() -> DatabaseListenerService:
    """Get or create the global DatabaseListenerService instance."""
    global _db_listener_service
    
    if _db_listener_service is None:
        _db_listener_service = DatabaseListenerService()
    
    return _db_listener_service

