"""
Centralized Price Service for fetching current prices from database.

Single source of truth for all price queries - reads from market_latest_trades
table (primary source) with fallback to latest market_data bars.
"""

import logging
from typing import Dict, List
from sqlalchemy import select, and_, desc
from datetime import datetime, timezone

from app.services.core.database import get_async_session
from app.models.market_data import MarketLatestTrade, MarketData


logger = logging.getLogger(__name__)


class PriceService:
    """Service for fetching current prices from database tables."""
    
    async def get_latest_prices_batch(self, symbols: List[str]) -> Dict[str, float]:
        """
        Fetch latest prices for multiple symbols in a single batch query.
        
        Primary source: market_latest_trades table (updated every 5 seconds from Polygon)
        Fallback: Latest close price from market_data table (1-minute bars)
        
        This is much more efficient than calling external APIs or making individual queries.
        Uses a single query with WHERE symbol IN (...) for optimal performance.
        
        Args:
            symbols: List of stock symbols
            
        Returns:
            Dictionary mapping symbol to current price. Symbols without data are omitted.
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                # First, try to get prices from market_latest_trades (most recent)
                stmt = select(
                    MarketLatestTrade.symbol,
                    MarketLatestTrade.price
                ).where(
                    MarketLatestTrade.symbol.in_(symbols)
                )
                
                result = await session.execute(stmt)
                price_map = {row.symbol: float(row.price) for row in result}
                
                # For symbols not found in latest_trades, fallback to market_data
                missing_symbols = [s for s in symbols if s not in price_map]
                
                if missing_symbols:
                    logger.debug(
                        f"Fetching fallback prices for {len(missing_symbols)} symbols "
                        f"from market_data: {missing_symbols}"
                    )
                    
                    # Get latest close price from market_data for each missing symbol
                    # Use subquery to get the most recent bar for each symbol
                    for symbol in missing_symbols:
                        stmt = select(
                            MarketData.close
                        ).where(
                            and_(
                                MarketData.symbol == symbol,
                                MarketData.timescale == '1min'
                            )
                        ).order_by(
                            desc(MarketData.time)
                        ).limit(1)
                        
                        result = await session.execute(stmt)
                        row = result.scalar_one_or_none()
                        
                        if row:
                            price_map[symbol] = float(row)
                
                logger.debug(
                    f"Fetched {len(price_map)} prices for {len(symbols)} requested symbols"
                )
                
                return price_map
                
        except Exception as e:
            logger.error(f"Error fetching batch prices: {e}", exc_info=True)
            return {}
    
    async def get_latest_price(self, symbol: str) -> float | None:
        """
        Fetch latest price for a single symbol.
        
        For batch operations, use get_latest_prices_batch() instead for better performance.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Current price, or None if not available
        """
        result = await self.get_latest_prices_batch([symbol])
        return result.get(symbol)


# Global instance
_price_service: PriceService | None = None


def get_price_service() -> PriceService:
    """Get or create the global PriceService instance."""
    global _price_service
    
    if _price_service is None:
        _price_service = PriceService()
    
    return _price_service

