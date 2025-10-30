"""
Helper script to add the archived column to the funds table.
Run this once to apply the migration manually.
"""

import asyncio
import os
from sqlalchemy import text
from app.services.database import get_async_session

async def add_archived_column():
    """Add archived column to funds table."""
    async with get_async_session() as session:
        # Check if column already exists
        result = await session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='funds' AND column_name='archived'
        """))
        
        if result.fetchone():
            print("✅ Column 'archived' already exists in funds table")
            return
        
        # Add the column
        print("Adding 'archived' column to funds table...")
        await session.execute(text(
            "ALTER TABLE funds ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await session.commit()
        print("✅ Successfully added 'archived' column to funds table")

if __name__ == "__main__":
    asyncio.run(add_archived_column())


