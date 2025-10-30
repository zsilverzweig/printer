#!/usr/bin/env python3
"""
Manual script to fix sync issues caused by partially filled orders without transactions.

This script will:
1. Find orders with status='partially_filled' that have no corresponding transactions
2. Create the missing transaction records
3. Update fund balances accordingly

Run this ONCE to fix the existing GPRK, TAL, and OBIO sync issues.
"""

import asyncio
import sys
import uuid
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Add parent directory to path
sys.path.insert(0, '/Users/zs/repos/printer/apps/server')

from app.models.strategies import Order, Transaction, Fund


async def fix_partial_fill_sync():
    """Find and fix partially filled orders without transactions."""
    
    # Create database connection
    engine = create_async_engine(
        "postgresql+asyncpg://postgres:postgres@localhost:5433/printer_events",
        echo=False,
    )
    
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find all partially_filled orders
        stmt = select(Order).where(Order.status == "partially_filled")
        result = await session.execute(stmt)
        partial_orders = result.scalars().all()
        
        print(f"\n🔍 Found {len(partial_orders)} partially filled orders\n")
        
        fixed_count = 0
        
        for order in partial_orders:
            # Check if transaction exists
            txn_stmt = select(Transaction).where(Transaction.order_id == order.id)
            txn_result = await session.execute(txn_stmt)
            existing_txn = txn_result.scalar_one_or_none()
            
            if existing_txn:
                print(f"  ✅ {order.symbol}: Transaction already exists (ID: {existing_txn.id[:8]}...)")
                continue
            
            # Missing transaction! Create it
            print(f"\n  ❌ {order.symbol}: Missing transaction")
            print(f"     Order ID: {order.id}")
            print(f"     Alpaca ID: {order.alpaca_order_id}")
            print(f"     Side: {order.side}")
            print(f"     Quantity: {order.quantity} requested")
            print(f"     Filled: {order.filled_qty} @ ${order.filled_avg_price:.2f}")
            
            # Create transaction
            transaction = Transaction(
                id=str(uuid.uuid4()),
                order_id=order.id,
                alpaca_order_id=order.alpaca_order_id,
                fund_id=order.fund_id,
                symbol=order.symbol,
                side=order.side,
                quantity=order.filled_qty or order.quantity,
                price=order.filled_avg_price or 0.0,
                total_value=(order.filled_qty or order.quantity) * (order.filled_avg_price or 0.0),
                timestamp=order.filled_at or order.submitted_at,
                high_water_mark=order.filled_avg_price if order.side == "buy" else None,
                strategy_state={},
            )
            
            session.add(transaction)
            
            # Update fund balance
            fund = await session.get(Fund, order.fund_id)
            if fund:
                old_balance = fund.balance
                if order.side == "buy":
                    fund.balance -= transaction.total_value
                else:  # sell
                    fund.balance += transaction.total_value
                
                print(f"     💰 Balance: ${old_balance:.2f} → ${fund.balance:.2f}")
            
            print(f"     ✅ Created transaction: {transaction.quantity} shares @ ${transaction.price:.2f} = ${transaction.total_value:.2f}")
            fixed_count += 1
        
        # Commit all changes
        if fixed_count > 0:
            await session.commit()
            print(f"\n✅ Fixed {fixed_count} orphaned positions!")
            print(f"   Transactions created and balances updated.\n")
        else:
            print(f"\n✅ No orphaned positions found - everything is synced!\n")
    
    await engine.dispose()


if __name__ == "__main__":
    print("=" * 60)
    print("Partial Fill Sync Fix")
    print("=" * 60)
    print("\nThis script will create missing transactions for partially")
    print("filled orders that don't have transaction records.\n")
    
    input("Press Enter to continue or Ctrl+C to cancel...")
    
    asyncio.run(fix_partial_fill_sync())
    
    print("=" * 60)
    print("Done!")
    print("=" * 60)

