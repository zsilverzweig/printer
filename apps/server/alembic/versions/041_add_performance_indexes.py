"""add_performance_indexes

Revision ID: 041
Revises: 040
Create Date: 2025-01-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '041'
down_revision = '040'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # TickerState composite indexes for common query patterns
    # Partial index for state filtering (only indexes non-null states)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ticker_states_fund_state 
        ON ticker_states(fund_id, current_state) 
        WHERE current_state IS NOT NULL
    """)
    
    # Orders composite indexes for common query patterns
    # Partial index for active orders (pending/partially_filled)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_orders_fund_status 
        ON orders(fund_id, status) 
        WHERE status IN ('pending', 'partially_filled')
    """)
    
    # Composite index for symbol-based queries
    op.create_index(
        'idx_orders_fund_symbol',
        'orders',
        ['fund_id', 'symbol']
    )
    
    # Partial index for backtest queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_orders_fund_backtest 
        ON orders(fund_id, backtest_id) 
        WHERE backtest_id IS NOT NULL
    """)
    
    # Transactions composite indexes for common query patterns
    # Index for timestamp-based queries (DESC for recent-first queries)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transactions_fund_timestamp 
        ON transactions(fund_id, timestamp DESC)
    """)
    
    # Trades composite indexes for common query patterns
    # Index for entry time queries (DESC for recent-first queries)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_trades_fund_entry_time 
        ON trades(fund_id, entry_time DESC)
    """)
    
    # Events composite index for filtered recent events
    # Index for event type + ID DESC (for recent events by type)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_type_id_desc 
        ON events(event_type, id DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_events_type_id_desc")
    op.execute("DROP INDEX IF EXISTS idx_trades_fund_entry_time")
    op.execute("DROP INDEX IF EXISTS idx_transactions_fund_timestamp")
    op.execute("DROP INDEX IF EXISTS idx_orders_fund_backtest")
    op.drop_index('idx_orders_fund_symbol', 'orders')
    op.execute("DROP INDEX IF EXISTS idx_orders_fund_status")
    op.execute("DROP INDEX IF EXISTS idx_ticker_states_fund_state")

