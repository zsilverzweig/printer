from __future__ import annotations

from typing import List
import asyncio
import json
import logging
import threading

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


