from __future__ import annotations

from typing import List, Set
import asyncio
import json
import logging
import threading
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from polygon import WebSocketClient

import app.core as core
from app.core import rest_client
from app.services.screener.screener import get_screener_service
from app.services.realtime.db_listener import get_db_listener_service


router = APIRouter()


@router.websocket("/ws")
async def ws_proxy(websocket: WebSocket, subs: str = ""):
    """WebSocket proxy for Polygon market data streams."""
    import logging
    logger = logging.getLogger("app.realtime")
    
    logger.info("WebSocket connection attempt received for subs=%s", subs)
    try:
        await websocket.accept()
        logger.info("WebSocket connection accepted for subs=%s", subs)
    except Exception as e:
        logger.error("Failed to accept WebSocket connection: %s", e, exc_info=True)
        raise
    
    subscriptions: List[str] = [s.strip() for s in subs.split(",") if s.strip()]
    queue: asyncio.Queue = asyncio.Queue()

    loop = asyncio.get_event_loop()

    def handle_msg(msgs):
        for m in msgs:
            asyncio.run_coroutine_threadsafe(queue.put(m), loop)

    def run_websocket_with_error_handling():
        """Run WebSocket with proper error handling to prevent thread crashes."""
        try:
            ws.run(handle_msg=handle_msg)
        except Exception as e:
            # Log connection errors gracefully instead of crashing the thread
            # Common errors: ConnectionClosedError (1008 policy violation when switching stocks rapidly)
            logger.warning(
                "Polygon WebSocket connection closed for subs=%s: %s",
                subs,
                str(e)
            )
            # Put None in queue to signal connection failure to main loop
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    # Use real-time WebSocket endpoint (not delayed) for paid subscriptions
    # Real-time: wss://socket.polygon.io/stocks
    # Delayed: wss://delayed.polygon.io/stocks
    ws = WebSocketClient(
        api_key=core.API_KEY,
        subscriptions=subscriptions,
        url="wss://socket.polygon.io/stocks"  # Real-time feed
    )
    t = threading.Thread(target=run_websocket_with_error_handling, daemon=True)
    t.start()

    try:
        while True:
            m = await queue.get()
            # Handle connection failure signal from WebSocket thread
            if m is None:
                logger.warning("WebSocket connection failed for subs=%s, closing client connection", subs)
                break
            await websocket.send_text(json.dumps(jsonable_encoder(m)))
    except Exception as e:
        logger.info("WebSocket send loop ended for subs=%s: %s", subs, str(e))
    finally:
        try:
            if hasattr(ws, "close"):
                ws.close()
            elif hasattr(ws, "stop"):
                ws.stop()
        except Exception:
            pass


@router.websocket("/realtime")
async def unified_realtime(websocket: WebSocket):
    """Unified WebSocket endpoint for all real-time data (screener, market, funds)."""
    logger = logging.getLogger("app.realtime")
    
    await websocket.accept()
    logger.info("Unified realtime WebSocket connection accepted")
    
    # Track this client's market subscriptions
    client_market_subscriptions: Set[str] = set()
    polygon_ws = None
    polygon_thread = None
    polygon_queue = None
    
    # Track this client's fund subscriptions
    client_fund_subscriptions: Set[str] = set()
    last_fund_price_refresh = time.time()
    fund_price_refresh_interval = 30  # Refresh fund prices every 30 seconds
    
    # Define helper functions first (before try block)
    async def start_polygon_websocket():
        """Start Polygon WebSocket for market data subscriptions."""
        nonlocal polygon_ws, polygon_thread, polygon_queue
        
        if polygon_ws is not None:
            return
        
        logger.info("Starting Polygon WebSocket for symbols: %s", list(client_market_subscriptions))
        
        # Create subscriptions for Polygon (A.SYMBOL for second bars, AM.SYMBOL for minute bars)
        polygon_subs = []
        for symbol in client_market_subscriptions:
            polygon_subs.extend([f"A.{symbol}", f"AM.{symbol}"])
        
        polygon_queue = asyncio.Queue()
        loop = asyncio.get_event_loop()
        
        def handle_polygon_message(msgs):
            for msg in msgs:
                asyncio.run_coroutine_threadsafe(polygon_queue.put(msg), loop)
        
        def run_polygon_websocket():
            try:
                ws_client = WebSocketClient(
                    api_key=core.API_KEY,
                    subscriptions=polygon_subs,
                    url="wss://socket.polygon.io/stocks"
                )
                ws_client.run(handle_msg=handle_polygon_message)
            except Exception as e:
                logger.warning("Polygon WebSocket error: %s", e)
                asyncio.run_coroutine_threadsafe(polygon_queue.put(None), loop)
        
        polygon_thread = threading.Thread(target=run_polygon_websocket, daemon=True)
        polygon_thread.start()
        
        # Start forwarding messages
        asyncio.create_task(forward_polygon_messages())
    
    async def stop_polygon_websocket():
        """Stop Polygon WebSocket."""
        nonlocal polygon_ws, polygon_thread, polygon_queue
        
        if polygon_ws is None:
            return
        
        logger.info("Stopping Polygon WebSocket")
        
        try:
            if hasattr(polygon_ws, "close"):
                polygon_ws.close()
            elif hasattr(polygon_ws, "stop"):
                polygon_ws.stop()
        except Exception:
            pass
        
        polygon_ws = None
        polygon_thread = None
        polygon_queue = None
    
    async def forward_polygon_messages():
        """Forward Polygon messages to client with proper envelope."""
        while polygon_queue is not None:
            try:
                msg = await polygon_queue.get()
                if msg is None:  # Connection failure signal
                    break
                
                # Check if websocket is still connected before sending
                from starlette.websockets import WebSocketState
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.warning("WebSocket disconnected, stopping Polygon message forwarding")
                    break
                
                # Wrap in our message format
                wrapped_msg = {
                    "type": "market_data",
                    "data": jsonable_encoder(msg),
                    "timestamp": int(time.time() * 1000)
                }
                
                await websocket.send_json(wrapped_msg)
            except Exception as e:
                logger.error("Error forwarding Polygon message: %s", e)
                break
    
    try:
        # Screener service is optional now – just report availability to the client
        screener_service = get_screener_service()
        screener_available = screener_service is not None

        # Get database listener service for fund updates
        db_listener = get_db_listener_service()
        if not db_listener.running:
            try:
                await db_listener.start()
            except Exception as e:
                logger.error("Failed to start DatabaseListenerService: %s", e)
                # Continue anyway - fund updates just won't work
        
        # Send initial connection status
        try:
            await websocket.send_json({
                "type": "connection_status",
                "data": {
                    "screener": screener_available,
                    "market": True
                },
                "timestamp": int(time.time() * 1000)
            })
        except Exception as e:
            logger.error("Failed to send initial data to client: %s", e)
            await websocket.close()
            return
        
        # Handle client messages (market subscriptions, ping/pong, fund subscriptions)
        while True:
            try:
                # Check websocket state before attempting to receive
                from starlette.websockets import WebSocketState
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.warning("WebSocket not connected (state=%s), closing connection", websocket.client_state)
                    break
                
                # Use timeout so we can periodically refresh fund prices
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=1.0  # Check every second
                )
                data = json.loads(message)
                
                # Handle ping/pong
                if data.get("type") == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": data.get("timestamp"),
                        "data": None
                    })
                    continue
                
                # Handle market subscriptions
                if data.get("action") == "subscribe_market":
                    symbols = data.get("symbols", [])
                    if isinstance(symbols, list):
                        # Add new subscriptions
                        for symbol in symbols:
                            if symbol not in client_market_subscriptions:
                                client_market_subscriptions.add(symbol)
                        
                        # Start Polygon WebSocket if we have subscriptions and don't have one yet
                        if client_market_subscriptions and polygon_ws is None:
                            await start_polygon_websocket()
                
                elif data.get("action") == "unsubscribe_market":
                    symbols = data.get("symbols", [])
                    if isinstance(symbols, list):
                        for symbol in symbols:
                            client_market_subscriptions.discard(symbol)
                        
                        # Stop Polygon WebSocket if no more subscriptions
                        if not client_market_subscriptions and polygon_ws is not None:
                            await stop_polygon_websocket()
                
                # Handle fund subscriptions
                elif data.get("action") == "subscribe_funds":
                    fund_ids = data.get("fund_ids", [])
                    if isinstance(fund_ids, list):
                        # Only process funds that aren't already subscribed
                        new_subscriptions = [fid for fid in fund_ids if fid not in client_fund_subscriptions]
                        if new_subscriptions:
                            logger.debug(f"Subscribing to funds: {new_subscriptions}")
                            for fund_id in new_subscriptions:
                                client_fund_subscriptions.add(fund_id)
                                # Subscribe to PostgreSQL NOTIFY for this fund
                                db_listener.subscribe(fund_id, websocket)
                                
                                # Send immediate snapshot
                                from app.routers.funds import get_fund_snapshot
                                snapshot = await get_fund_snapshot(fund_id)
                                
                                if snapshot:
                                    await websocket.send_json({
                                        "type": "fund_snapshot",
                                        "fund_id": fund_id,
                                        "data": snapshot,
                                        "timestamp": int(time.time() * 1000)
                                    })
                                    logger.debug(f"Sent fund snapshot for {fund_id}")
                                else:
                                    logger.warning(f"Fund {fund_id} not found for snapshot")
                
                elif data.get("action") == "unsubscribe_funds":
                    fund_ids = data.get("fund_ids", [])
                    if isinstance(fund_ids, list):
                        # Only process funds that are actually subscribed
                        valid_unsubscriptions = [fid for fid in fund_ids if fid in client_fund_subscriptions]
                        if valid_unsubscriptions:
                            logger.debug(f"Unsubscribing from funds: {valid_unsubscriptions}")
                            for fund_id in valid_unsubscriptions:
                                client_fund_subscriptions.discard(fund_id)
                                # Unsubscribe from PostgreSQL NOTIFY
                                db_listener.unsubscribe(fund_id, websocket)
                
            except asyncio.TimeoutError:
                # No message received - check if we need to refresh fund prices
                if client_fund_subscriptions and time.time() - last_fund_price_refresh >= fund_price_refresh_interval:
                    try:
                        # Refresh prices and performance for all subscribed funds
                        from app.routers.funds import _get_positions_for_websocket, _calculate_fund_performance
                        
                        for fund_id in client_fund_subscriptions:
                            # Fetch updated position prices
                            positions_data = await _get_positions_for_websocket(fund_id)
                            
                            # Calculate performance metrics
                            performance_data = await _calculate_fund_performance(fund_id)
                            
                            # Broadcast positions update
                            await websocket.send_json({
                                "type": "fund_update",
                                "fund_id": fund_id,
                                "category": "positions",
                                "event_type": "positions_updated",
                                "timestamp": int(time.time() * 1000),
                                "data": {
                                    "positions": positions_data["positions"],
                                    "summary": positions_data["summary"]
                                }
                            })
                            
                            # Send separate performance update
                            await websocket.send_json({
                                "type": "fund_update",
                                "fund_id": fund_id,
                                "category": "performance",
                                "event_type": "performance_updated",
                                "timestamp": int(time.time() * 1000),
                                "data": performance_data
                            })
                        
                        last_fund_price_refresh = time.time()
                        logger.debug(f"Refreshed prices for {len(client_fund_subscriptions)} subscribed funds")
                        
                    except Exception as e:
                        logger.warning(f"Error refreshing fund prices: {e}")
                
                # Continue waiting
                continue
                
            except json.JSONDecodeError:
                logger.warning("Received invalid JSON from client")
            except Exception as e:
                logger.error("Error handling client message: %s", e)
                # Break on WebSocket errors (disconnect, closed, not connected, etc.)
                error_str = str(e).lower()
                if any(keyword in error_str for keyword in ["disconnect", "closed", "not connected", "invalid state"]):
                    break
                # Also break if we can't receive messages (websocket in bad state)
                from starlette.websockets import WebSocketState
                if websocket.client_state != WebSocketState.CONNECTED:
                    logger.warning("WebSocket not in CONNECTED state, breaking loop")
                    break
    
    except Exception as e:
        logger.info("Unified realtime WebSocket connection closed: %s", e)
    finally:
        # Cleanup
        # Nothing to clean up for screener service anymore – it operates on-demand
        
        # Clean up fund subscriptions
        for fund_id in client_fund_subscriptions:
            db_listener.unsubscribe(fund_id, websocket)
        
        if polygon_ws:
            await stop_polygon_websocket()
        
        logger.info("Cleaned up unified realtime connection")


