"""
Database Listener Service for PostgreSQL NOTIFY/LISTEN.

Listens to PostgreSQL notification channels and broadcasts changes
to WebSocket subscribers organized by fund_id.
"""

import asyncio
import json
import logging
import os
from typing import Dict, Set
from fastapi import WebSocket

import asyncpg


logger = logging.getLogger(__name__)


class DatabaseListenerService:
    """
    Service that listens to PostgreSQL NOTIFY events and broadcasts
    to WebSocket clients organized by fund_id.
    """
    
    def __init__(self):
        self.connection: asyncpg.Connection | None = None
        self.subscribers: Dict[str, Set[WebSocket]] = {}  # fund_id -> set of websockets
        self.running = False
        self._listen_task: asyncio.Task | None = None
        
    async def start(self):
        """Start the database listener service."""
        if self.running:
            logger.warning("DatabaseListenerService is already running")
            return
            
        logger.info("Starting DatabaseListenerService...")
        
        # Get database URL from environment
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is not set")
        
        # Convert SQLAlchemy URL to asyncpg format
        # postgresql+asyncpg://user:pass@host:port/db -> postgresql://user:pass@host:port/db
        if database_url.startswith("postgresql+asyncpg://"):
            database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
        
        try:
            # Create asyncpg connection for LISTEN/NOTIFY
            self.connection = await asyncpg.connect(database_url)
            logger.info("✅ Connected to PostgreSQL for LISTEN/NOTIFY")
            
            # Add listeners for each notification channel
            await self.connection.add_listener('fund_orders_changed', self._handle_orders_notification)
            await self.connection.add_listener('fund_transactions_changed', self._handle_transactions_notification)
            await self.connection.add_listener('fund_transfers_changed', self._handle_transfers_notification)
            await self.connection.add_listener('fund_balance_changed', self._handle_balance_notification)
            
            logger.info("✅ Subscribed to all notification channels")
            
            self.running = True
            
            # Start background task to keep connection alive
            self._listen_task = asyncio.create_task(self._keep_alive_loop())
            
        except Exception as e:
            logger.error(f"❌ Failed to start DatabaseListenerService: {e}")
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
        
        # Close connection
        if self.connection:
            await self.connection.close()
            self.connection = None
        
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
                    await self.connection.fetchval("SELECT 1")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Connection keep-alive error: {e}")
                # Try to reconnect
                try:
                    await self.start()
                except Exception as reconnect_error:
                    logger.error(f"Reconnection failed: {reconnect_error}")
    
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
        
        # Get copy of subscribers to avoid modification during iteration
        subscribers = list(self.subscribers[fund_id])
        
        # Track disconnected clients
        disconnected = []
        
        for websocket in subscribers:
            try:
                # Check if websocket is still connected before sending
                from starlette.websockets import WebSocketState
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.debug(f"WebSocket not connected, skipping broadcast")
                    disconnected.append(websocket)
                    continue
                    
                await websocket.send_json(message)
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
                await self._broadcast_to_fund(fund_id, {
                    'type': 'update',
                    'category': 'orders',
                    'event_type': data.get('event_type'),
                    'timestamp': data.get('timestamp'),
                    'data': data.get('data')
                })
        except Exception as e:
            logger.error(f"Error handling order notification: {e}")
    
    async def _handle_transactions_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_transactions_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Transaction notification for fund {fund_id}: {data.get('event_type')}")
                await self._broadcast_to_fund(fund_id, {
                    'type': 'update',
                    'category': 'transactions',
                    'event_type': data.get('event_type'),
                    'timestamp': data.get('timestamp'),
                    'data': data.get('data')
                })
        except Exception as e:
            logger.error(f"Error handling transaction notification: {e}")
    
    async def _handle_transfers_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_transfers_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Transfer notification for fund {fund_id}: {data.get('event_type')}")
                await self._broadcast_to_fund(fund_id, {
                    'type': 'update',
                    'category': 'transfers',
                    'event_type': data.get('event_type'),
                    'timestamp': data.get('timestamp'),
                    'data': data.get('data')
                })
        except Exception as e:
            logger.error(f"Error handling transfer notification: {e}")
    
    async def _handle_balance_notification(self, connection, pid, channel, payload):
        """Handle notifications from fund_balance_changed channel."""
        try:
            data = json.loads(payload)
            fund_id = data.get('fund_id')
            
            if fund_id:
                logger.debug(f"Balance notification for fund {fund_id}: {data.get('data', {}).get('balance')}")
                await self._broadcast_to_fund(fund_id, {
                    'type': 'update',
                    'category': 'balance',
                    'event_type': data.get('event_type'),
                    'timestamp': data.get('timestamp'),
                    'data': data.get('data')
                })
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

