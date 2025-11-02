#!/usr/bin/env python3
"""
Quick script to add AI cost tracking columns to the funds table.
Run this once to enable AI cost tracking.
"""

import asyncio
from sqlalchemy import text
from app.services.core.database import get_async_session


async def add_ai_cost_columns():
    """Add AI cost tracking columns to funds table if they don't exist."""
    
    async with get_async_session() as session:
        try:
            # Check if columns already exist
            result = await session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'funds' 
                AND column_name IN ('total_ai_cost', 'ai_cost_mtd', 'ai_cost_ytd', 'last_ai_cost_reset')
            """))
            existing_columns = [row[0] for row in result.fetchall()]
            
            if len(existing_columns) == 4:
                print("✅ All AI cost columns already exist!")
                return
            
            print(f"Found {len(existing_columns)} existing columns: {existing_columns}")
            print("Adding missing AI cost columns...")
            
            # Add missing columns
            if 'total_ai_cost' not in existing_columns:
                await session.execute(text(
                    "ALTER TABLE funds ADD COLUMN IF NOT EXISTS total_ai_cost FLOAT NOT NULL DEFAULT 0.0"
                ))
                print("✅ Added total_ai_cost column")
            
            if 'ai_cost_mtd' not in existing_columns:
                await session.execute(text(
                    "ALTER TABLE funds ADD COLUMN IF NOT EXISTS ai_cost_mtd FLOAT NOT NULL DEFAULT 0.0"
                ))
                print("✅ Added ai_cost_mtd column")
            
            if 'ai_cost_ytd' not in existing_columns:
                await session.execute(text(
                    "ALTER TABLE funds ADD COLUMN IF NOT EXISTS ai_cost_ytd FLOAT NOT NULL DEFAULT 0.0"
                ))
                print("✅ Added ai_cost_ytd column")
            
            if 'last_ai_cost_reset' not in existing_columns:
                await session.execute(text(
                    "ALTER TABLE funds ADD COLUMN IF NOT EXISTS last_ai_cost_reset TIMESTAMP NULL"
                ))
                print("✅ Added last_ai_cost_reset column")
            
            await session.commit()
            print("\n🎉 Successfully added AI cost tracking columns!")
            
            # Create ai_costs table
            print("\nCreating ai_costs table...")
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_costs (
                    id VARCHAR(36) PRIMARY KEY,
                    fund_id VARCHAR(36) NOT NULL REFERENCES funds(id),
                    symbol VARCHAR(10),
                    operation VARCHAR(50) NOT NULL,
                    model VARCHAR(50) NOT NULL,
                    prompt_tokens INTEGER NOT NULL,
                    completion_tokens INTEGER NOT NULL,
                    total_tokens INTEGER NOT NULL,
                    cost FLOAT NOT NULL,
                    timestamp TIMESTAMP NOT NULL,
                    extra_data JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """))
            print("✅ Created ai_costs table")
            
            # Create indexes
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ai_costs_fund_id ON ai_costs(fund_id)"
            ))
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ai_costs_symbol ON ai_costs(symbol)"
            ))
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ai_costs_timestamp ON ai_costs(timestamp)"
            ))
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ai_costs_fund_timestamp ON ai_costs(fund_id, timestamp)"
            ))
            print("✅ Created indexes")
            
            await session.commit()
            print("\n🎉 AI cost tracking is now fully enabled!")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            await session.rollback()
            raise


if __name__ == "__main__":
    print("🔧 Setting up AI cost tracking...\n")
    asyncio.run(add_ai_cost_columns())

