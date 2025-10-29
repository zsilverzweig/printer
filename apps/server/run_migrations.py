#!/usr/bin/env python3
"""
Run database migrations using Alembic.

This script is called on container startup to ensure the database schema
is up to date before starting the FastAPI application.
"""
import os
import sys
from alembic.config import Config
from alembic import command

def run_migrations():
    """Run all pending Alembic migrations."""
    print("🔄 Running database migrations...")
    
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Create Alembic config
    alembic_cfg = Config(os.path.join(script_dir, "alembic.ini"))
    
    # Set the script location relative to this file
    alembic_cfg.set_main_option("script_location", os.path.join(script_dir, "alembic"))
    
    try:
        # Run migrations
        command.upgrade(alembic_cfg, "head")
        print("✅ Database migrations completed successfully")
        return 0
    except Exception as e:
        print(f"❌ Database migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(run_migrations())

