"""
Fund Auto-Start Service

Automatically restarts trading engines for funds that were active before server restart.
"""

import logging
from sqlalchemy import select

from app.models.strategies import Fund
from app.services.core.database import get_async_session
from app.services.strategies.strategy_factory import create_strategy_engine
from app.services.strategies.engine_registry import register_engine, get_engine

logger = logging.getLogger(__name__)


async def auto_start_active_funds() -> None:
    """
    Query database for funds with status='active' and start their trading engines.
    
    This ensures that funds that were trading before a server restart
    will automatically resume trading when the server comes back online.
    """
    try:
        async with get_async_session() as session:
            # Query for all active funds
            stmt = select(Fund).where(Fund.status == "active")
            result = await session.execute(stmt)
            active_funds = result.scalars().all()
            
            if not active_funds:
                logger.info("📭 No active funds found - nothing to auto-start")
                return
            
            logger.info(f"🔄 Found {len(active_funds)} active fund(s) to auto-start")
            
            started_count = 0
            failed_count = 0
            
            for fund in active_funds:
                try:
                    # Check if already running (shouldn't be on fresh start)
                    if get_engine(fund.id):
                        logger.info(f"⏭️  Fund {fund.id} ({fund.name}) already has running engine, skipping")
                        continue
                    
                    # Validate strategy configuration
                    if not fund.strategy_id:
                        logger.warning(
                            f"⚠️  Cannot auto-start fund {fund.id} ({fund.name}): "
                            f"No strategy configured. Setting status to paused."
                        )
                        fund.status = "paused"
                        await session.commit()
                        failed_count += 1
                        continue
                    
                    logger.info(
                        f"🚀 Auto-starting fund: {fund.id} ({fund.name}) "
                        f"[mode={fund.mode}, strategy={fund.strategy_id}, balance=${fund.balance:.2f}]"
                    )
                    
                    # Create and start the strategy engine
                    engine = await create_strategy_engine(fund=fund)
                    await engine.start()
                    
                    # Register in the global engine registry
                    register_engine(fund.id, engine)
                    
                    logger.info(f"✅ Fund {fund.id} ({fund.name}) auto-started successfully")
                    started_count += 1
                    
                except Exception as e:
                    logger.error(
                        f"❌ Failed to auto-start fund {fund.id} ({fund.name}): {e}",
                        exc_info=True
                    )
                    
                    # Set fund status to paused on failure
                    try:
                        fund.status = "paused"
                        await session.commit()
                        logger.info(f"Set fund {fund.id} status to 'paused' after auto-start failure")
                    except Exception as inner_e:
                        logger.error(f"Failed to update fund status: {inner_e}")
                    
                    failed_count += 1
            
            # Summary
            logger.info(
                f"🏁 Auto-start complete: {started_count} started, "
                f"{failed_count} failed, {len(active_funds)} total"
            )
            
            # Broadcast startup summary
            if started_count > 0:
                try:
                    from app.routers.realtime import broadcast_trading_activity
                    from datetime import datetime, timezone
                    
                    await broadcast_trading_activity({
                        "event_type": "server_startup",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "message": f"Server restarted - Auto-started {started_count} fund(s)",
                        "details": {
                            "total_active_funds": len(active_funds),
                            "successfully_started": started_count,
                            "failed_to_start": failed_count,
                        }
                    })
                except Exception as broadcast_error:
                    logger.warning(f"Failed to broadcast auto-start summary: {broadcast_error}")
    
    except Exception as e:
        logger.error(f"❌ Error in auto_start_active_funds: {e}", exc_info=True)

