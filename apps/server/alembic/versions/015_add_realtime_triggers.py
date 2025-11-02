"""Add real-time triggers for PostgreSQL NOTIFY

Revision ID: 015
Revises: 014
Create Date: 2025-11-01

This migration adds PostgreSQL triggers that emit NOTIFY events when
orders, transactions, transfers, or fund balances change.

This enables real-time updates via WebSocket connections that LISTEN
to these channels.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add PostgreSQL triggers to emit NOTIFY events on data changes.
    
    Creates triggers for:
    - orders table: NOTIFY on INSERT/UPDATE
    - transactions table: NOTIFY on INSERT/UPDATE
    - transfers table: NOTIFY on INSERT/UPDATE
    - funds table: NOTIFY on balance UPDATE
    """
    
    # Trigger function for orders table
    op.execute("""
        CREATE OR REPLACE FUNCTION notify_fund_orders_changed()
        RETURNS TRIGGER AS $$
        DECLARE
            payload JSON;
        BEGIN
            -- Build JSON payload with fund_id and order data
            IF TG_OP = 'DELETE' THEN
                payload = json_build_object(
                    'fund_id', OLD.fund_id,
                    'event_type', 'order_deleted',
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', OLD.id,
                        'symbol', OLD.symbol
                    )
                );
                PERFORM pg_notify('fund_orders_changed', payload::text);
                RETURN OLD;
            ELSE
                payload = json_build_object(
                    'fund_id', NEW.fund_id,
                    'event_type', CASE 
                        WHEN TG_OP = 'INSERT' THEN 'order_created'
                        ELSE 'order_updated'
                    END,
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', NEW.id,
                        'symbol', NEW.symbol,
                        'side', NEW.side,
                        'quantity', NEW.quantity,
                        'order_type', NEW.order_type,
                        'status', NEW.status,
                        'submitted_at', NEW.submitted_at::text,
                        'filled_at', NEW.filled_at::text,
                        'filled_qty', NEW.filled_qty,
                        'filled_avg_price', NEW.filled_avg_price,
                        'alpaca_order_id', NEW.alpaca_order_id
                    )
                );
                PERFORM pg_notify('fund_orders_changed', payload::text);
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    # Create trigger (idempotent)
    op.execute("""
        DO $$
        BEGIN
            DROP TRIGGER IF EXISTS orders_notify_trigger ON orders;
            
            CREATE TRIGGER orders_notify_trigger
            AFTER INSERT OR UPDATE OR DELETE ON orders
            FOR EACH ROW
            EXECUTE FUNCTION notify_fund_orders_changed();
        END $$;
    """)
    
    # Trigger function for transactions table
    op.execute("""
        CREATE OR REPLACE FUNCTION notify_fund_transactions_changed()
        RETURNS TRIGGER AS $$
        DECLARE
            payload JSON;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                payload = json_build_object(
                    'fund_id', OLD.fund_id,
                    'event_type', 'transaction_deleted',
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', OLD.id,
                        'symbol', OLD.symbol
                    )
                );
                PERFORM pg_notify('fund_transactions_changed', payload::text);
                RETURN OLD;
            ELSE
                payload = json_build_object(
                    'fund_id', NEW.fund_id,
                    'event_type', CASE 
                        WHEN TG_OP = 'INSERT' THEN 'transaction_created'
                        ELSE 'transaction_updated'
                    END,
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', NEW.id,
                        'symbol', NEW.symbol,
                        'side', NEW.side,
                        'quantity', NEW.quantity,
                        'price', NEW.price,
                        'total_value', NEW.total_value,
                        'timestamp', NEW.timestamp::text
                    )
                );
                PERFORM pg_notify('fund_transactions_changed', payload::text);
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    # Create trigger (idempotent)
    op.execute("""
        DO $$
        BEGIN
            DROP TRIGGER IF EXISTS transactions_notify_trigger ON transactions;
            
            CREATE TRIGGER transactions_notify_trigger
            AFTER INSERT OR UPDATE OR DELETE ON transactions
            FOR EACH ROW
            EXECUTE FUNCTION notify_fund_transactions_changed();
        END $$;
    """)
    
    # Trigger function for transfers table
    op.execute("""
        CREATE OR REPLACE FUNCTION notify_fund_transfers_changed()
        RETURNS TRIGGER AS $$
        DECLARE
            payload JSON;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                payload = json_build_object(
                    'fund_id', OLD.fund_id,
                    'event_type', 'transfer_deleted',
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', OLD.id
                    )
                );
                PERFORM pg_notify('fund_transfers_changed', payload::text);
                RETURN OLD;
            ELSE
                payload = json_build_object(
                    'fund_id', NEW.fund_id,
                    'event_type', CASE 
                        WHEN TG_OP = 'INSERT' THEN 'transfer_created'
                        ELSE 'transfer_updated'
                    END,
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', NEW.id,
                        'amount', NEW.amount,
                        'transfer_type', NEW.transfer_type,
                        'notes', NEW.notes,
                        'timestamp', NEW.timestamp::text
                    )
                );
                PERFORM pg_notify('fund_transfers_changed', payload::text);
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    # Create trigger (idempotent)
    op.execute("""
        DO $$
        BEGIN
            DROP TRIGGER IF EXISTS transfers_notify_trigger ON transfers;
            
            CREATE TRIGGER transfers_notify_trigger
            AFTER INSERT OR UPDATE OR DELETE ON transfers
            FOR EACH ROW
            EXECUTE FUNCTION notify_fund_transfers_changed();
        END $$;
    """)
    
    # Trigger function for funds table (balance changes only)
    op.execute("""
        CREATE OR REPLACE FUNCTION notify_fund_balance_changed()
        RETURNS TRIGGER AS $$
        DECLARE
            payload JSON;
        BEGIN
            -- Only notify if balance actually changed
            IF TG_OP = 'UPDATE' AND OLD.balance IS DISTINCT FROM NEW.balance THEN
                payload = json_build_object(
                    'fund_id', NEW.id,
                    'event_type', 'balance_changed',
                    'timestamp', NOW()::text,
                    'data', json_build_object(
                        'id', NEW.id,
                        'name', NEW.name,
                        'balance', NEW.balance,
                        'old_balance', OLD.balance
                    )
                );
                PERFORM pg_notify('fund_balance_changed', payload::text);
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    # Create trigger (idempotent)
    op.execute("""
        DO $$
        BEGIN
            DROP TRIGGER IF EXISTS funds_balance_notify_trigger ON funds;
            
            CREATE TRIGGER funds_balance_notify_trigger
            AFTER UPDATE ON funds
            FOR EACH ROW
            EXECUTE FUNCTION notify_fund_balance_changed();
        END $$;
    """)


def downgrade() -> None:
    """Remove all real-time notification triggers."""
    
    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS orders_notify_trigger ON orders;")
    op.execute("DROP TRIGGER IF EXISTS transactions_notify_trigger ON transactions;")
    op.execute("DROP TRIGGER IF EXISTS transfers_notify_trigger ON transfers;")
    op.execute("DROP TRIGGER IF EXISTS funds_balance_notify_trigger ON funds;")
    
    # Drop trigger functions
    op.execute("DROP FUNCTION IF EXISTS notify_fund_orders_changed();")
    op.execute("DROP FUNCTION IF EXISTS notify_fund_transactions_changed();")
    op.execute("DROP FUNCTION IF EXISTS notify_fund_transfers_changed();")
    op.execute("DROP FUNCTION IF EXISTS notify_fund_balance_changed();")

