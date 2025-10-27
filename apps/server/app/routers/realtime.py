from __future__ import annotations

from typing import List, Set
import asyncio
import json
import logging
import threading
import time

from fastapi import APIRouter, WebSocket
from fastapi.encoders import jsonable_encoder
from polygon import WebSocketClient

import app.core as core
from app.core import rest_client
from app.services.screener import ScreenerService
from app.services.noc import NocService


router = APIRouter()
service: ScreenerService | None = None
noc_service: NocService | None = None


@router.websocket("/noc/ws")
async def noc_ws(websocket: WebSocket):
    """WebSocket endpoint for NOC (Network Operations Center) real-time data."""
    global noc_service, service
    import logging
    logger = logging.getLogger("app.realtime")
    
    await websocket.accept()
    logger.info("NOC WebSocket connection accepted")
    
    # Ensure screener service is running (NOC depends on it)
    if service is None:
        logger.info("Initializing ScreenerService (required by NOC)")
        service = ScreenerService(rest_client)
        try:
            await service.start()
        except Exception as e:
            service = None
            logger.error("Screener service failed to start: %s", e)
            try:
                await websocket.close()
            finally:
                return
    
    # Lazy init: create and start NOC service on first connection
    if noc_service is None:
        logger.info("Initializing NocService for first time")
        noc_service = NocService(rest_client, service)
        try:
            await noc_service.start()
        except Exception as e:
            noc_service = None
            logger.error("NOC service failed to start: %s", e)
            try:
                await websocket.close()
            finally:
                return
    
    # Attach to NOC service broadcast list and send last cached payload
    noc_service.subscribers.add(websocket)
    logger.info("Added NOC subscriber, total subscribers=%s", len(noc_service.subscribers))
    if noc_service.cached_payload:
        logger.info("Sending cached NOC payload with %s stocks", len(noc_service.cached_payload))
        await websocket.send_json(noc_service.cached_payload)
    else:
        logger.info("No cached NOC payload to send yet")
    try:
        while True:
            # Keep-alive; wait for client messages or disconnection
            message = await websocket.receive_text()
            
            # Handle ping/pong for connection keep-alive
            try:
                data = json.loads(message)
                if isinstance(data, dict) and data.get("type") == "ping":
                    # Respond to ping with pong
                    await websocket.send_json({"type": "pong", "timestamp": data.get("timestamp")})
                    if logger.isEnabledFor(logging.DEBUG):
                        logger.debug("Sent pong response to NOC client")
            except (json.JSONDecodeError, Exception):
                # Not JSON or other error, ignore and continue
                pass
    except Exception as e:
        logger.info("NOC WebSocket connection closed: %s", e)
    finally:
        noc_service.subscribers.discard(websocket)
        logger.info("Removed NOC subscriber, remaining subscribers=%s", len(noc_service.subscribers))


@router.websocket("/screener/ws")
async def screener_ws(websocket: WebSocket):
    global service
    import logging
    logger = logging.getLogger("app.realtime")
    
    await websocket.accept()
    logger.info("Screener WebSocket connection accepted")
    
    # Lazy init: create and start service on first connection
    if service is None:
        logger.info("Initializing ScreenerService for first time")
        service = ScreenerService(rest_client)
        try:
            await service.start()
        except Exception as e:
            service = None
            logger.error("Screener service failed to start: %s", e)
            try:
                await websocket.close()
            finally:
                return
    
    # Attach to screener service broadcast list and send last cached payload
    service.subscribers.add(websocket)
    logger.info("Added subscriber, total subscribers=%s", len(service.subscribers))
    if service.cached_payload:
        logger.info("Sending cached payload with %s results", len(service.cached_payload))
        await websocket.send_json(service.cached_payload)
    else:
        logger.info("No cached payload to send yet")
    try:
        while True:
            # Keep-alive; wait for client messages or disconnection
            message = await websocket.receive_text()
            
            # Handle ping/pong for connection keep-alive
            try:
                data = json.loads(message)
                if isinstance(data, dict) and data.get("type") == "ping":
                    # Respond to ping with pong
                    await websocket.send_json({"type": "pong", "timestamp": data.get("timestamp")})
                    if logger.isEnabledFor(logging.DEBUG):
                        logger.debug("Sent pong response to screener client")
            except (json.JSONDecodeError, Exception):
                # Not JSON or other error, ignore and continue
                pass
    except Exception as e:
        logger.info("WebSocket connection closed: %s", e)
    finally:
        service.subscribers.discard(websocket)
        logger.info("Removed subscriber, remaining subscribers=%s", len(service.subscribers))


@router.websocket("/ws")
async def ws_proxy(websocket: WebSocket, subs: str = ""):
    global service
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

    # Route special screener subscription through the ScreenerService rather than Polygon WS
    if any(s.upper() == "SCREENER" for s in subscriptions):
        logger.info("SCREENER subscription detected, setting up service")
        # Lazy init: create and start service on first connection
        if service is None:
            logger.info("Initializing ScreenerService for first time")
            service = ScreenerService(rest_client)
            try:
                await service.start()
            except Exception as e:
                service = None
                logging.getLogger("app.screener").error("Screener service failed to start: %s", e)
                try:
                    await websocket.close()
                finally:
                    return
        # Attach to screener service broadcast list and send last cached payload
        service.subscribers.add(websocket)
        logger.info("Added subscriber, total subscribers=%s", len(service.subscribers))
        if service.cached_payload:
            logger.info("Sending cached payload with %s results", len(service.cached_payload))
            await websocket.send_json(service.cached_payload)
        else:
            logger.info("No cached payload to send yet")
        try:
            while True:
                # Keep-alive; wait for client messages or disconnection
                message = await websocket.receive_text()
                
                # Handle ping/pong for connection keep-alive
                try:
                    data = json.loads(message)
                    if isinstance(data, dict) and data.get("type") == "ping":
                        # Respond to ping with pong
                        await websocket.send_json({"type": "pong", "timestamp": data.get("timestamp")})
                        if logger.isEnabledFor(logging.DEBUG):
                            logger.debug("Sent pong response to ws_proxy client")
                except (json.JSONDecodeError, Exception):
                    # Not JSON or other error, ignore and continue
                    pass
        except Exception as e:
            logger.info("WebSocket connection closed: %s", e)
        finally:
            service.subscribers.discard(websocket)
            logger.info("Removed subscriber, remaining subscribers=%s", len(service.subscribers))
        return

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
    """Unified WebSocket endpoint for all real-time data (NOC, screener, market)."""
    global service, noc_service
    logger = logging.getLogger("app.realtime")
    
    await websocket.accept()
    logger.info("Unified realtime WebSocket connection accepted")
    
    # Track this client's market subscriptions
    client_market_subscriptions: Set[str] = set()
    polygon_ws = None
    polygon_thread = None
    polygon_queue = None
    
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
        # Ensure services are running
        if service is None:
            logger.info("Initializing ScreenerService for unified connection")
            service = ScreenerService(rest_client)
            try:
                await service.start()
            except Exception as e:
                service = None
                logger.error("Screener service failed to start: %s", e)
                await websocket.close()
                return
        
        if noc_service is None:
            logger.info("Initializing NocService for unified connection")
            noc_service = NocService(rest_client, service)
            try:
                await noc_service.start()
            except Exception as e:
                noc_service = None
                logger.error("NOC service failed to start: %s", e)
                await websocket.close()
                return
        
        # Subscribe to NOC and Screener broadcasts
        noc_service.subscribers.add(websocket)
        service.subscribers.add(websocket)
        
        # Send initial connection status
        await websocket.send_json({
            "type": "connection_status",
            "data": {
                "noc": True,
                "screener": True,
                "market": True
            },
            "timestamp": int(time.time() * 1000)
        })
        
        # Send cached data if available
        if noc_service.cached_payload:
            await websocket.send_json({
                "type": "noc_update",
                "data": noc_service.cached_payload,
                "timestamp": int(time.time() * 1000)
            })
        
        if service.cached_payload:
            await websocket.send_json({
                "type": "screener_update",
                "data": service.cached_payload,
                "timestamp": int(time.time() * 1000)
            })
        
        # Handle client messages (market subscriptions, ping/pong)
        while True:
            try:
                message = await websocket.receive_text()
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
                
            except json.JSONDecodeError:
                logger.warning("Received invalid JSON from client")
            except Exception as e:
                logger.error("Error handling client message: %s", e)
    
    except Exception as e:
        logger.info("Unified realtime WebSocket connection closed: %s", e)
    finally:
        # Cleanup
        if noc_service:
            noc_service.subscribers.discard(websocket)
        if service:
            service.subscribers.discard(websocket)
        
        if polygon_ws:
            await stop_polygon_websocket()
        
        logger.info("Cleaned up unified realtime connection")


