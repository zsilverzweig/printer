"""
Trade Builder Service

Manages the creation and updating of Trade records from transactions.
Provides both auto-update mode (for new trades) and backfill mode (for historical data).
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from app.services.core.time_context import get_current_time
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Trade, Transaction, Order, Fund
from app.services.strategies.ticker_state_service import get_ticker_state_service
from app.services.trading.position_service import create_position_for_trade, close_position_for_trade
from app.types import TickerStateTransitionCode

logger = logging.getLogger(__name__)


class TradeBuilder:
    """Service for building and maintaining Trade records from transactions."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.ticker_state_service = get_ticker_state_service()
    
    async def create_trade_from_entry(
        self,
        trade_id: str,
        fund_id: str,
        symbol: str,
        entry_order_id: str,
        entry_transactions: List[Transaction],
        strategy_id: Optional[str] = None,
        screening_criteria_id: Optional[str] = None,
        ai_confidence: Optional[float] = None,
        ai_reasoning: Optional[str] = None,
    ) -> Trade:
        """
        Create a new Trade record when opening a position.
        
        Args:
            trade_id: Unique trade identifier
            fund_id: Fund ID
            symbol: Stock symbol
            entry_order_id: Order ID for entry
            entry_transactions: List of entry transaction records
            strategy_id: Strategy that opened this trade
            screening_criteria_id: Pattern/setup ID
            ai_confidence: AI confidence score
            ai_reasoning: AI rationale for trade
            
        Returns:
            Created Trade record
        """
        # Calculate entry metrics from transactions
        total_quantity = sum(txn.quantity for txn in entry_transactions)
        total_cost = sum(txn.total_value for txn in entry_transactions)
        avg_entry_price = total_cost / total_quantity if total_quantity > 0 else 0.0
        entry_time = min(txn.timestamp for txn in entry_transactions)
        
        trade = Trade(
            id=trade_id,
            fund_id=fund_id,
            symbol=symbol,
            entry_order_id=entry_order_id,
            entry_time=entry_time,
            entry_price=avg_entry_price,
            entry_quantity=total_quantity,
            strategy_id=strategy_id,
            screening_criteria_id=screening_criteria_id,
            ai_confidence=ai_confidence,
            ai_reasoning=ai_reasoning,
            status="open",
            trade_metadata={}
        )
        
        self.session.add(trade)
        await self.session.flush()
        
        # Create/update position linked to this trade
        # Note: Position may already exist from transaction updates, but we ensure it's linked to the trade
        try:
            await create_position_for_trade(
                session=self.session,
                fund_id=fund_id,
                symbol=symbol,
                trade_id=trade_id,
                entry_quantity=total_quantity,
                entry_price=avg_entry_price
            )
        except Exception as e:
            logger.warning(
                f"Failed to create/update position for trade {trade_id} ({symbol}): {e}. "
                f"Position may already exist from transaction updates."
            )
        
        # Transition ticker to 'filled' state
        try:
            await self.ticker_state_service.transition_ticker(
                fund_id=fund_id,
                ticker=symbol,
                to_state="filled",
                transition_code=TickerStateTransitionCode.ENTRY_ORDER_FILLED.value,
                description=f"Entry order filled: {total_quantity:.2f} shares @ ${avg_entry_price:.2f}",
                trade_id=trade_id
            )
        except Exception as e:
            logger.warning(f"Failed to transition ticker state for {symbol}: {e}")
        
        logger.info(
            f"Created trade {trade_id} for {symbol}: "
            f"qty={total_quantity:.2f}, price=${avg_entry_price:.2f}"
        )
        
        return trade
    
    async def close_trade(
        self,
        trade_id: str,
        exit_order_id: str,
        exit_transactions: List[Transaction]
    ) -> Trade:
        """
        Close an existing Trade record with exit information.
        
        Args:
            trade_id: Trade to close
            exit_order_id: Order ID for exit
            exit_transactions: List of exit transaction records
            
        Returns:
            Updated Trade record
        """
        # Get the trade
        result = await self.session.execute(
            select(Trade).where(Trade.id == trade_id)
        )
        trade = result.scalar_one_or_none()
        
        if not trade:
            raise ValueError(f"Trade {trade_id} not found")
        
        # Calculate exit metrics
        total_quantity = sum(txn.quantity for txn in exit_transactions)
        total_proceeds = sum(txn.total_value for txn in exit_transactions)
        avg_exit_price = total_proceeds / total_quantity if total_quantity > 0 else 0.0
        exit_time = max(txn.timestamp for txn in exit_transactions)
        
        # Calculate P&L
        total_cost = trade.entry_price * total_quantity
        realized_pnl = total_proceeds - total_cost
        realized_pnl_percent = (realized_pnl / total_cost * 100) if total_cost > 0 else 0.0
        
        # Calculate hold duration
        hold_duration = (exit_time - trade.entry_time).total_seconds()
        
        # Update trade
        trade.exit_order_id = exit_order_id
        trade.exit_time = exit_time
        trade.exit_price = avg_exit_price
        trade.exit_quantity = total_quantity
        trade.realized_pnl = realized_pnl
        trade.realized_pnl_percent = realized_pnl_percent
        trade.hold_duration_seconds = int(hold_duration)
        trade.status = "closed"
        trade.updated_at = get_current_time()
        
        await self.session.flush()
        
        # Close position when trade closes
        # Position should already be at zero from sell transactions, but verify and clean up
        try:
            await close_position_for_trade(
                session=self.session,
                fund_id=trade.fund_id,
                symbol=trade.symbol
            )
        except Exception as e:
            logger.warning(
                f"Failed to close position for trade {trade_id} ({trade.symbol}): {e}. "
                f"Position may have already been closed by sell transactions."
            )
        
        # Transition ticker to 'exited' state
        # Determine exit reason from trade metadata if available
        exit_code = TickerStateTransitionCode.EXIT_ORDER_FILLED.value
        exit_description = f"Position closed: {total_quantity:.2f} shares @ ${avg_exit_price:.2f}, P&L=${realized_pnl:.2f}"
        
        trade_metadata = trade.trade_metadata or {}
        if trade_metadata.get("exit_reason") == "stop_loss":
            exit_code = TickerStateTransitionCode.STOP_LOSS_TRIGGERED.value
            exit_description = f"Stop loss triggered: {total_quantity:.2f} shares @ ${avg_exit_price:.2f}"
        elif trade_metadata.get("exit_reason") == "take_profit":
            exit_code = TickerStateTransitionCode.TAKE_PROFIT_TRIGGERED.value
            exit_description = f"Take profit triggered: {total_quantity:.2f} shares @ ${avg_exit_price:.2f}"
        elif trade_metadata.get("exit_reason") == "manual":
            exit_code = TickerStateTransitionCode.MANUAL_CLOSE.value
            exit_description = f"Manual close: {total_quantity:.2f} shares @ ${avg_exit_price:.2f}"
        
        try:
            await self.ticker_state_service.mark_ticker_exited(
                fund_id=trade.fund_id,
                ticker=trade.symbol,
                trade_id=trade_id,
                transition_code=exit_code,
                description=exit_description
            )
        except Exception as e:
            logger.warning(f"Failed to transition ticker state to exited for {trade.symbol}: {e}")
        
        logger.info(
            f"Closed trade {trade_id} for {trade.symbol}: "
            f"P&L=${realized_pnl:.2f} ({realized_pnl_percent:+.2f}%), "
            f"duration={hold_duration/60:.1f}min"
        )
        
        return trade
    
    async def backfill_trades_for_fund(
        self,
        fund_id: str,
        dry_run: bool = False
    ) -> Dict[str, any]:
        """
        Backfill Trade records for a fund using FIFO matching.
        
        This processes all historical transactions for a fund that don't have
        trade_ids, groups them into trades using FIFO accounting, and creates
        Trade records with performance metrics.
        
        Args:
            fund_id: Fund to backfill
            dry_run: If True, don't commit changes
            
        Returns:
            Statistics about backfill operation
        """
        logger.info(f"Starting trade backfill for fund {fund_id}")
        
        # Get all transactions without trade_id, sorted chronologically
        result = await self.session.execute(
            select(Transaction)
            .where(and_(
                Transaction.fund_id == fund_id,
                Transaction.trade_id.is_(None)
            ))
            .order_by(Transaction.timestamp)
        )
        transactions = result.scalars().all()
        
        if not transactions:
            logger.info(f"No transactions to backfill for fund {fund_id}")
            return {
                "trades_created": 0,
                "transactions_processed": 0,
                "symbols_processed": 0
            }
        
        logger.info(f"Found {len(transactions)} transactions to process")
        
        # Group transactions by symbol and match using FIFO
        trades_by_symbol = {}  # symbol -> list of (buy_txns, sell_txns, trade_id)
        
        # Track open lots per symbol using FIFO
        open_lots_by_symbol: Dict[str, List[Tuple[Transaction, float]]] = {}  # symbol -> [(txn, remaining_qty), ...]
        
        for txn in transactions:
            symbol = txn.symbol
            
            if symbol not in open_lots_by_symbol:
                open_lots_by_symbol[symbol] = []
            
            if txn.side == "buy":
                # Add to open lots
                open_lots_by_symbol[symbol].append((txn, txn.quantity))
            
            elif txn.side == "sell":
                # Match against open lots using FIFO
                sell_qty_remaining = txn.quantity
                matched_buy_txns = []
                
                while sell_qty_remaining > 0 and open_lots_by_symbol[symbol]:
                    buy_txn, buy_qty_remaining = open_lots_by_symbol[symbol][0]
                    
                    if buy_qty_remaining <= sell_qty_remaining:
                        # Fully consume this buy lot
                        matched_buy_txns.append(buy_txn)
                        sell_qty_remaining -= buy_qty_remaining
                        open_lots_by_symbol[symbol].pop(0)
                    else:
                        # Partially consume this buy lot
                        matched_buy_txns.append(buy_txn)
                        open_lots_by_symbol[symbol][0] = (buy_txn, buy_qty_remaining - sell_qty_remaining)
                        sell_qty_remaining = 0
                
                # Create trade record for this matched trade
                if matched_buy_txns:
                    trade_id = str(uuid.uuid4())
                    
                    if symbol not in trades_by_symbol:
                        trades_by_symbol[symbol] = []
                    
                    trades_by_symbol[symbol].append((matched_buy_txns, [txn], trade_id))
        
        # Create Trade records
        trades_created = 0
        transactions_updated = 0
        orders_updated = 0
        
        for symbol, trade_groups in trades_by_symbol.items():
            for buy_txns, sell_txns, trade_id in trade_groups:
                # Calculate entry metrics
                total_entry_qty = sum(txn.quantity for txn in buy_txns)
                total_entry_cost = sum(txn.total_value for txn in buy_txns)
                avg_entry_price = total_entry_cost / total_entry_qty if total_entry_qty > 0 else 0.0
                entry_time = min(txn.timestamp for txn in buy_txns)
                entry_order_id = buy_txns[0].order_id
                
                # Calculate exit metrics
                total_exit_qty = sum(txn.quantity for txn in sell_txns)
                total_exit_proceeds = sum(txn.total_value for txn in sell_txns)
                avg_exit_price = total_exit_proceeds / total_exit_qty if total_exit_qty > 0 else 0.0
                exit_time = max(txn.timestamp for txn in sell_txns)
                exit_order_id = sell_txns[0].order_id
                
                # Calculate P&L
                realized_pnl = total_exit_proceeds - total_entry_cost
                realized_pnl_percent = (realized_pnl / total_entry_cost * 100) if total_entry_cost > 0 else 0.0
                
                # Calculate hold duration
                hold_duration = (exit_time - entry_time).total_seconds()
                
                # Create Trade record
                trade = Trade(
                    id=trade_id,
                    fund_id=fund_id,
                    symbol=symbol,
                    entry_order_id=entry_order_id,
                    entry_time=entry_time,
                    entry_price=avg_entry_price,
                    entry_quantity=total_entry_qty,
                    exit_order_id=exit_order_id,
                    exit_time=exit_time,
                    exit_price=avg_exit_price,
                    exit_quantity=total_exit_qty,
                    realized_pnl=realized_pnl,
                    realized_pnl_percent=realized_pnl_percent,
                    hold_duration_seconds=int(hold_duration),
                    status="closed",
                    trade_metadata={"backfilled": True}
                )
                
                if not dry_run:
                    self.session.add(trade)
                    trades_created += 1
                    
                    # Update transactions with trade_id
                    for txn in buy_txns + sell_txns:
                        txn.trade_id = trade_id
                        transactions_updated += 1
                    
                    # Update orders with trade_id
                    for order_id in set([txn.order_id for txn in buy_txns + sell_txns]):
                        result = await self.session.execute(
                            select(Order).where(Order.id == order_id)
                        )
                        order = result.scalar_one_or_none()
                        if order and not order.trade_id:
                            order.trade_id = trade_id
                            orders_updated += 1
        
        if not dry_run:
            await self.session.flush()
        
        stats = {
            "fund_id": fund_id,
            "trades_created": trades_created,
            "transactions_processed": transactions_updated,
            "orders_updated": orders_updated,
            "symbols_processed": len(trades_by_symbol),
            "dry_run": dry_run
        }
        
        logger.info(
            f"Backfill complete for fund {fund_id}: "
            f"{trades_created} trades created, "
            f"{transactions_updated} transactions updated, "
            f"{orders_updated} orders updated"
        )
        
        return stats
    
    async def get_open_trade_for_symbol(
        self,
        fund_id: str,
        symbol: str
    ) -> Optional[Trade]:
        """
        Get the open trade for a symbol in a fund, if any exists.
        
        Args:
            fund_id: Fund ID
            symbol: Stock symbol
            
        Returns:
            Open Trade record or None
        """
        result = await self.session.execute(
            select(Trade).where(and_(
                Trade.fund_id == fund_id,
                Trade.symbol == symbol,
                Trade.status == "open"
            ))
        )
        return result.scalar_one_or_none()

