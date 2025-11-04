"""
Test Trade ID Tracking and Performance Analytics

Tests the complete lifecycle of trade tracking:
- Trade ID generation and propagation
- Trade record creation and updates
- Performance metrics calculation
- Pattern effectiveness analysis
"""

import uuid
from datetime import datetime, timedelta
import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.strategies import Fund, Order, Transaction, Trade
from app.services.analytics.trade_builder import TradeBuilder
from app.services.analytics.performance_calculator import PerformanceCalculator
from app.services.analytics.pattern_analyzer import PatternAnalyzer


@pytest_asyncio.fixture
async def test_fund(async_session):
    """Create a test fund for trade tracking tests."""
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Performance Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="test_strategy",
        size_per_trade=1000.0
    )
    async_session.add(fund)
    await async_session.commit()
    return fund


@pytest.mark.asyncio
async def test_trade_id_propagation_buy_and_sell(async_session, test_fund):
    """
    Test that trade_id propagates correctly through order -> transaction -> trade
    for a complete buy-sell cycle.
    """
    # Create a trade_id
    trade_id = str(uuid.uuid4())
    
    # Create buy order with trade_id
    buy_order = Order(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=150.0
    )
    async_session.add(buy_order)
    
    # Create buy transaction with trade_id
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order.id,
        fund_id=test_fund.id,
        trade_id=trade_id,  # Inherited from order
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(buy_txn)
    await async_session.flush()
    
    # Create Trade record
    trade_builder = TradeBuilder(async_session)
    trade = await trade_builder.create_trade_from_entry(
        trade_id=trade_id,
        fund_id=test_fund.id,
        symbol="AAPL",
        entry_order_id=buy_order.id,
        entry_transactions=[buy_txn],
        strategy_id="test_strategy"
    )
    
    assert trade.id == trade_id
    assert trade.symbol == "AAPL"
    assert trade.entry_quantity == 10.0
    assert trade.entry_price == 150.0
    assert trade.status == "open"
    
    # Now sell
    sell_order = Order(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        trade_id=trade_id,  # Link to same trade
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=160.0
    )
    async_session.add(sell_order)
    
    sell_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=sell_order.id,
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        price=160.0,
        total_value=1600.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(sell_txn)
    await async_session.flush()
    
    # Close the trade
    closed_trade = await trade_builder.close_trade(
        trade_id=trade_id,
        exit_order_id=sell_order.id,
        exit_transactions=[sell_txn]
    )
    
    assert closed_trade.status == "closed"
    assert closed_trade.exit_quantity == 10.0
    assert closed_trade.exit_price == 160.0
    assert closed_trade.realized_pnl == 100.0  # (160 - 150) * 10
    assert closed_trade.realized_pnl_percent == pytest.approx(6.67, abs=0.1)
    assert closed_trade.hold_duration_seconds is not None


@pytest.mark.asyncio
async def test_partial_fill_tracking(async_session, test_fund):
    """Test tracking of partial fills with same trade_id."""
    trade_id = str(uuid.uuid4())
    
    # Order for 100 shares
    order = Order(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="TSLA",
        side="buy",
        quantity=100.0,
        order_type="market",
        status="partially_filled",
        submitted_at=datetime.utcnow()
    )
    async_session.add(order)
    
    # First partial fill: 50 shares
    txn1 = Transaction(
        id=str(uuid.uuid4()),
        order_id=order.id,
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="TSLA",
        side="buy",
        quantity=50.0,
        price=200.0,
        total_value=10000.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(txn1)
    
    # Second partial fill: 50 shares at different price
    txn2 = Transaction(
        id=str(uuid.uuid4()),
        order_id=order.id,
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="TSLA",
        side="buy",
        quantity=50.0,
        price=202.0,
        total_value=10100.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(txn2)
    await async_session.flush()
    
    # Create trade from both partials
    trade_builder = TradeBuilder(async_session)
    trade = await trade_builder.create_trade_from_entry(
        trade_id=trade_id,
        fund_id=test_fund.id,
        symbol="TSLA",
        entry_order_id=order.id,
        entry_transactions=[txn1, txn2],
        strategy_id="test_strategy"
    )
    
    # Should calculate weighted average price
    assert trade.entry_quantity == 100.0
    assert trade.entry_price == 201.0  # (10000 + 10100) / 100


@pytest.mark.asyncio
async def test_failed_order_no_trade_created(async_session, test_fund):
    """Test that failed orders don't create trade records."""
    trade_id = str(uuid.uuid4())
    
    # Create failed order
    order = Order(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="NVDA",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="failed",
        error_message="Insufficient buying power",
        submitted_at=datetime.utcnow()
    )
    async_session.add(order)
    await async_session.flush()
    
    # No transactions created for failed order
    # No trade record should exist
    result = await async_session.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    trade = result.scalar_one_or_none()
    
    assert trade is None


@pytest.mark.asyncio
async def test_performance_metrics_calculation(async_session, test_fund):
    """Test calculation of comprehensive performance metrics."""
    # Create multiple closed trades with various outcomes
    trades_data = [
        {"symbol": "AAPL", "entry": 100, "exit": 110, "qty": 10},  # +$100 win
        {"symbol": "GOOGL", "entry": 200, "exit": 195, "qty": 5},  # -$25 loss
        {"symbol": "MSFT", "entry": 150, "exit": 165, "qty": 10},  # +$150 win
        {"symbol": "AMZN", "entry": 120, "exit": 115, "qty": 10},  # -$50 loss
        {"symbol": "META", "entry": 180, "exit": 200, "qty": 5},   # +$100 win
    ]
    
    base_time = datetime.utcnow() - timedelta(days=30)
    
    for i, data in enumerate(trades_data):
        trade_id = str(uuid.uuid4())
        entry_time = base_time + timedelta(days=i*2)
        exit_time = entry_time + timedelta(hours=4)
        
        pnl = (data["exit"] - data["entry"]) * data["qty"]
        pnl_percent = ((data["exit"] - data["entry"]) / data["entry"]) * 100
        
        trade = Trade(
            id=trade_id,
            fund_id=test_fund.id,
            symbol=data["symbol"],
            entry_time=entry_time,
            exit_time=exit_time,
            entry_price=data["entry"],
            exit_price=data["exit"],
            entry_quantity=data["qty"],
            exit_quantity=data["qty"],
            realized_pnl=pnl,
            realized_pnl_percent=pnl_percent,
            hold_duration_seconds=14400,  # 4 hours
            status="closed",
            strategy_id="test_strategy"
        )
        async_session.add(trade)
    
    await async_session.flush()
    
    # Calculate metrics
    calculator = PerformanceCalculator(async_session)
    metrics = await calculator.calculate_metrics(fund_id=test_fund.id)
    
    # Verify basic metrics
    assert metrics["total_trades"] == 5
    assert metrics["winning_trades"] == 3
    assert metrics["losing_trades"] == 2
    assert metrics["win_rate"] == 60.0  # 3/5
    assert metrics["total_pnl"] == 275.0  # 100 - 25 + 150 - 50 + 100
    
    # Verify profit factor: (total wins / total losses)
    # Wins: 100 + 150 + 100 = 350
    # Losses: 25 + 50 = 75
    assert metrics["profit_factor"] == pytest.approx(350/75, abs=0.1)
    
    # Verify we have risk metrics
    assert "sharpe_ratio" in metrics
    assert "sortino_ratio" in metrics
    assert "max_drawdown" in metrics


@pytest.mark.asyncio
async def test_pattern_effectiveness_analysis(async_session, test_fund):
    """Test pattern/screening criteria effectiveness analysis."""
    # Create screening criteria
    from app.models.strategies import ScreeningCriteria
    
    criteria1_id = str(uuid.uuid4())
    criteria1 = ScreeningCriteria(
        id=criteria1_id,
        name="High Volume Breakout",
        criteria={"min_volume": 1000000, "relative_volume": 2.0}
    )
    async_session.add(criteria1)
    
    criteria2_id = str(uuid.uuid4())
    criteria2 = ScreeningCriteria(
        id=criteria2_id,
        name="Gap Up Pattern",
        criteria={"min_gap": 5.0}
    )
    async_session.add(criteria2)
    
    # Create trades using different criteria
    # Criteria 1: 3 wins, 1 loss
    for i in range(3):
        trade = Trade(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol=f"WIN{i}",
            screening_criteria_id=criteria1_id,
            entry_time=datetime.utcnow() - timedelta(days=i),
            exit_time=datetime.utcnow() - timedelta(days=i, hours=-4),
            entry_price=100.0,
            exit_price=105.0,
            entry_quantity=10.0,
            exit_quantity=10.0,
            realized_pnl=50.0,
            realized_pnl_percent=5.0,
            hold_duration_seconds=14400,
            status="closed"
        )
        async_session.add(trade)
    
    # One loss for criteria 1
    trade = Trade(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        symbol="LOSS1",
        screening_criteria_id=criteria1_id,
        entry_time=datetime.utcnow() - timedelta(days=4),
        exit_time=datetime.utcnow() - timedelta(days=4, hours=-4),
        entry_price=100.0,
        exit_price=95.0,
        entry_quantity=10.0,
        exit_quantity=10.0,
        realized_pnl=-50.0,
        realized_pnl_percent=-5.0,
        hold_duration_seconds=14400,
        status="closed"
    )
    async_session.add(trade)
    
    # Criteria 2: 1 win, 2 losses (worse pattern)
    trade = Trade(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        symbol="WIN2",
        screening_criteria_id=criteria2_id,
        entry_time=datetime.utcnow() - timedelta(days=5),
        exit_time=datetime.utcnow() - timedelta(days=5, hours=-4),
        entry_price=100.0,
        exit_price=110.0,
        entry_quantity=10.0,
        exit_quantity=10.0,
        realized_pnl=100.0,
        realized_pnl_percent=10.0,
        hold_duration_seconds=14400,
        status="closed"
    )
    async_session.add(trade)
    
    for i in range(2):
        trade = Trade(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol=f"LOSS{i+2}",
            screening_criteria_id=criteria2_id,
            entry_time=datetime.utcnow() - timedelta(days=6+i),
            exit_time=datetime.utcnow() - timedelta(days=6+i, hours=-4),
            entry_price=100.0,
            exit_price=90.0,
            entry_quantity=10.0,
            exit_quantity=10.0,
            realized_pnl=-100.0,
            realized_pnl_percent=-10.0,
            hold_duration_seconds=14400,
            status="closed"
        )
        async_session.add(trade)
    
    await async_session.flush()
    
    # Analyze patterns
    analyzer = PatternAnalyzer(async_session)
    patterns = await analyzer.analyze_patterns(
        fund_id=test_fund.id,
        min_sample_size=3
    )
    
    # Should return 2 patterns
    assert len(patterns) == 2
    
    # Find criteria 1 results (should be better)
    pattern1 = next(p for p in patterns if p["criteria_id"] == criteria1_id)
    assert pattern1["win_rate"] == 75.0  # 3/4
    assert pattern1["total_trades"] == 4
    assert pattern1["total_pnl"] == 100.0  # 3*50 - 50
    
    # Find criteria 2 results (should be worse)
    pattern2 = next(p for p in patterns if p["criteria_id"] == criteria2_id)
    assert pattern2["win_rate"] == pytest.approx(33.33, abs=0.1)  # 1/3
    assert pattern2["total_pnl"] == -100.0  # 100 - 2*100


@pytest.mark.asyncio
async def test_equity_curve_generation(async_session, test_fund):
    """Test equity curve data generation for visualization."""
    # Create sequence of trades
    base_time = datetime.utcnow() - timedelta(days=10)
    
    trades_pnl = [100, -50, 75, -25, 150]  # Cumulative should be: 100, 50, 125, 100, 250
    
    for i, pnl in enumerate(trades_pnl):
        trade = Trade(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol=f"SYM{i}",
            entry_time=base_time + timedelta(days=i*2),
            exit_time=base_time + timedelta(days=i*2, hours=4),
            entry_price=100.0,
            exit_price=100.0 + pnl/10,  # Assuming 10 shares
            entry_quantity=10.0,
            exit_quantity=10.0,
            realized_pnl=pnl,
            realized_pnl_percent=(pnl/1000)*100,
            hold_duration_seconds=14400,
            status="closed"
        )
        async_session.add(trade)
    
    await async_session.flush()
    
    # Get equity curve
    result = await async_session.execute(
        select(Trade)
        .where(Trade.fund_id == test_fund.id)
        .where(Trade.status == "closed")
        .order_by(Trade.exit_time)
    )
    trades = result.scalars().all()
    
    # Calculate cumulative P&L
    cumulative = 0
    equity_points = []
    for trade in trades:
        cumulative += trade.realized_pnl
        equity_points.append({
            "time": trade.exit_time,
            "cumulative_pnl": cumulative
        })
    
    # Verify curve
    assert len(equity_points) == 5
    assert equity_points[0]["cumulative_pnl"] == 100
    assert equity_points[1]["cumulative_pnl"] == 50  # 100 - 50
    assert equity_points[2]["cumulative_pnl"] == 125  # 50 + 75
    assert equity_points[3]["cumulative_pnl"] == 100  # 125 - 25
    assert equity_points[4]["cumulative_pnl"] == 250  # 100 + 150


@pytest.mark.asyncio
async def test_open_trade_tracking(async_session, test_fund):
    """Test tracking of open trades (positions not yet closed)."""
    trade_id = str(uuid.uuid4())
    
    # Create open trade
    order = Order(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="AMD",
        side="buy",
        quantity=20.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow()
    )
    async_session.add(order)
    
    txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=order.id,
        fund_id=test_fund.id,
        trade_id=trade_id,
        symbol="AMD",
        side="buy",
        quantity=20.0,
        price=100.0,
        total_value=2000.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(txn)
    await async_session.flush()
    
    # Create trade record
    trade_builder = TradeBuilder(async_session)
    trade = await trade_builder.create_trade_from_entry(
        trade_id=trade_id,
        fund_id=test_fund.id,
        symbol="AMD",
        entry_order_id=order.id,
        entry_transactions=[txn]
    )
    
    # Verify it's open
    assert trade.status == "open"
    assert trade.exit_time is None
    assert trade.exit_price is None
    assert trade.realized_pnl is None
    
    # Should be able to find it
    open_trade = await trade_builder.get_open_trade_for_symbol(
        fund_id=test_fund.id,
        symbol="AMD"
    )
    assert open_trade is not None
    assert open_trade.id == trade_id

