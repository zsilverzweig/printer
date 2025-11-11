"""
Position Sync Service

Handles syncing positions from Alpaca and reconciling discrepancies.
This is CRITICAL code extracted from StrategyEngine for clarity.

Responsibilities:
- Refresh positions from Alpaca
- Filter positions by fund ownership
- Reconcile closed positions
- Get position details from transaction history
"""

import logging
from datetime import datetime
from typing import Dict, Set, Optional, Tuple

from app.services.core.time_context import get_current_time
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Transaction
from app.strategies.base import PositionContext
from app.services.core.database import get_async_session
from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.reconciliation_service import get_reconciliation_service
from app.services.trading.position_tracker import get_position_context

logger = logging.getLogger(__name__)


def _get_utc_timestamp() -> str:
    """Get current UTC timestamp as ISO string."""
    return get_current_time().isoformat() + "Z"


class PositionSyncService:
    """
    Service for syncing positions from Alpaca and reconciling discrepancies.
    
    CRITICAL: This code ensures our transaction ledger stays in sync with Alpaca.
    """
    
    def __init__(self, alpaca_service: AlpacaService):
        """
        Initialize position sync service.
        
        Args:
            alpaca_service: Alpaca trading service
        """
        self.alpaca_service = alpaca_service
    
    async def refresh_positions_from_alpaca(
        self,
        fund_id: str,
        fund_name: str
    ) -> Dict[str, PositionContext]:
        """
        Refresh positions from Alpaca.
        
        Queries Alpaca for current positions and filters to only positions
        that belong to this fund (based on transaction history).
        
        Args:
            fund_id: Fund ID
            fund_name: Fund name for logging
            
        Returns:
            Dictionary mapping symbol to PositionContext
        """
        try:
            logger.debug(f"📊 Querying active positions from Alpaca for fund {fund_id}")
            
            # Get ALL positions from Alpaca
            alpaca_positions = await self.alpaca_service.get_positions()
            
            position_cache = {}
            
            logger.debug(f"📊 Alpaca reports {len(alpaca_positions)} total position(s) in account")
            
            # Get symbols that belong to this fund (have buy transactions)
            fund_symbols = await self._get_fund_symbols(fund_id)
            logger.debug(
                f"📊 This fund has transactions for: {fund_symbols if fund_symbols else 'none'}"
            )
            
            for alpaca_pos in alpaca_positions:
                symbol = alpaca_pos["symbol"]
                
                # FILTER: Only include positions that belong to this fund
                if symbol not in fund_symbols:
                    logger.debug(
                        f"📊 Skipping {symbol} - not owned by this fund "
                        f"(belongs to different fund/strategy)"
                    )
                    continue
                
                # Get buy transactions for this symbol to calculate entry info
                entry_price, entry_time, strategy_state, high_water_mark = await self._get_position_details(
                    fund_id,
                    symbol
                )
                
                # Create PositionContext from Alpaca + our data
                position = PositionContext(
                    symbol=symbol,
                    entry_price=entry_price,
                    entry_time=entry_time,
                    quantity=alpaca_pos["qty"],
                    current_price=alpaca_pos["current_price"],
                    unrealized_pnl=alpaca_pos["unrealized_pl"],
                    unrealized_pnl_percent=alpaca_pos["unrealized_plpc"] * 100,
                    strategy_state=strategy_state,
                )
                
                position_cache[symbol] = position
                logger.debug(
                    f"📊 Position loaded: {symbol} - {alpaca_pos['qty']} shares @ "
                    f"${entry_price:.2f}, current ${alpaca_pos['current_price']:.2f}, "
                    f"P&L: ${alpaca_pos['unrealized_pl']:.2f}"
                )
            
            # NOTE: Temporarily disabling closed position reconciliation check
            # alpaca_symbols = {pos["symbol"] for pos in alpaca_positions}
            # closed_in_alpaca = fund_symbols - alpaca_symbols
            #
            # if closed_in_alpaca:
            #     logger.warning(
            #         f"⚠️  Found {len(closed_in_alpaca)} position(s) closed in Alpaca but still in transaction ledger: "
            #         f"{closed_in_alpaca}"
            #     )
            #
            #     # Trigger reconciliation for each closed position
            #     for symbol in closed_in_alpaca:
            #         await self._reconcile_closed_position(fund_id, fund_name, symbol)
            
            if position_cache:
                logger.info(
                    f"📊 Synced {len(position_cache)} position(s) from Alpaca for this fund: "
                    f"{list(position_cache.keys())}"
                )
            else:
                logger.debug("📊 No active positions for this fund")
            
            return position_cache
        
        except Exception as e:
            logger.error(f"Error refreshing positions from Alpaca: {e}", exc_info=True)
            return {}
    
    async def _reconcile_closed_position(self, fund_id: str, fund_name: str, symbol: str) -> None:
        """
        Reconcile a position that is closed in Alpaca but still shows in our transaction ledger.
        
        This situation occurs when:
        - A position was manually closed in Alpaca
        - An order filled but we missed recording the transaction
        - A partial fill closed the position and we didn't capture it
        
        We resolve it by:
        1. Checking Alpaca's Activities API for missing transactions
        2. Using the reconciliation service to auto-correct
        3. Creating missing sell transactions to sync our ledger
        
        Args:
            fund_id: Fund ID
            fund_name: Fund name for logging
            symbol: The symbol that's closed in Alpaca but still in our ledger
        """
        try:
            logger.warning(
                f"🔧 Reconciling closed position for {symbol} - "
                f"Alpaca shows 0 shares but transaction ledger shows open position"
            )
            
            # Get the reconciliation service
            reconciliation_service = get_reconciliation_service()
            
            if not reconciliation_service:
                logger.error(
                    f"❌ Cannot reconcile {symbol} - reconciliation service not available"
                )
                return
            
            # Use the reconciliation service to check and auto-correct
            # This will query Activities API and create missing transactions
            is_synced = await reconciliation_service.reconcile_symbol(
                fund_id=fund_id,
                symbol=symbol,
                order_id=None,  # Not tied to a specific order
                attempt=1,
                total_attempts=1
            )
            
            if is_synced:
                logger.info(
                    f"✅ Successfully reconciled {symbol} - "
                    f"position now synced with Alpaca"
                )
            else:
                logger.error(
                    f"❌ Failed to reconcile {symbol} - "
                    f"manual intervention may be required"
                )
        
        except Exception as e:
            logger.error(
                f"Error reconciling closed position for {symbol}: {e}",
                exc_info=True
            )
    
    async def _get_fund_symbols(self, fund_id: str) -> Set[str]:
        """
        Get all symbols that have open positions for this fund.
        
        Identifies symbols by checking if we have more buy transactions than sell transactions.
        
        Args:
            fund_id: Fund ID
            
        Returns:
            Set of symbols that belong to this fund
        """
        try:
            async with get_async_session() as session:
                # Get all transactions for this fund, grouped by symbol
                stmt = select(
                    Transaction.symbol,
                    Transaction.side,
                    Transaction.quantity
                ).where(
                    Transaction.fund_id == fund_id
                ).order_by(Transaction.timestamp.asc())
                
                result = await session.execute(stmt)
                transactions = result.all()
                
                # Calculate net position for each symbol
                position_tracker = {}
                for symbol, side, quantity in transactions:
                    if symbol not in position_tracker:
                        position_tracker[symbol] = 0
                    
                    if side == "buy":
                        position_tracker[symbol] += quantity
                    else:  # sell
                        position_tracker[symbol] -= quantity
                
                # Return symbols with net positive positions
                fund_symbols = {
                    symbol for symbol, qty in position_tracker.items()
                    if qty > 0.001  # Use small threshold to handle floating point
                }
                
                return fund_symbols
        
        except Exception as e:
            logger.error(f"Error getting fund symbols: {e}", exc_info=True)
            return set()
    
    async def _get_position_details(
        self,
        fund_id: str,
        symbol: str
    ) -> Tuple[float, datetime, dict, Optional[float]]:
        """
        Get position entry details from transaction history.
        
        Uses shared position_tracker service.
        
        Args:
            fund_id: Fund ID
            symbol: Symbol to get details for
            
        Returns:
            (entry_price, entry_time, strategy_state, high_water_mark)
        """
        try:
            async with get_async_session() as session:
                context = await get_position_context(session, fund_id, symbol)
                
                if context is None:
                    # No position history
                    return 0.0, get_current_time(), {}, None
                
                return (
                    context["entry_price"],
                    context["entry_time"],
                    context["strategy_state"],
                    context["high_water_mark"]
                )
        
        except Exception as e:
            logger.error(f"Error getting position details for {symbol}: {e}", exc_info=True)
            return 0.0, get_current_time(), {}, None

