"""
Validation Utilities

Pure functions for validating trading prices, stops, and position parameters.
Extracted from strategy implementations for reuse across all strategies.
"""

import math
from typing import Optional


def validate_entry_prices(
    entry_price: float,
    stop_loss: float,
    current_price: float,
    side: str = "long"
) -> tuple[bool, Optional[str]]:
    """
    Validate entry and stop loss prices are reasonable.
    
    Checks for:
    - Valid finite numbers (no NaN, infinity)
    - Entry price within reasonable distance of current price
    - Stop loss on correct side of entry
    - Stop loss not too tight or too wide
    
    Args:
        entry_price: Intended entry price
        stop_loss: Stop loss price
        current_price: Current market price
        side: "long" or "short" position
        
    Returns:
        (is_valid, error_message)
        If is_valid is False, error_message explains the problem
    """
    # Check current_price is valid
    if not math.isfinite(current_price) or current_price <= 0:
        return False, f"current_price is invalid: {current_price}"
    
    # Check for NaN or infinity
    if not math.isfinite(entry_price):
        return False, f"entry_price is not finite: {entry_price}"
    if not math.isfinite(stop_loss):
        return False, f"stop_loss is not finite: {stop_loss}"
    
    # Check prices are positive
    if entry_price <= 0:
        return False, f"entry_price must be positive: {entry_price}"
    if stop_loss <= 0:
        return False, f"stop_loss must be positive: {stop_loss}"
    
    # Check if entry price is too far from current price (>50% away)
    price_diff_pct = abs(entry_price - current_price) / current_price * 100
    if price_diff_pct > 50:
        return False, (
            f"entry_price ${entry_price:.2f} is {price_diff_pct:.1f}% away "
            f"from current price ${current_price:.2f}"
        )
    
    # Validate stop loss positioning based on side
    if side.lower() == "long":
        # Long: stop must be below entry
        if stop_loss >= entry_price:
            return False, (
                f"stop_loss ${stop_loss:.2f} must be below entry_price ${entry_price:.2f} "
                f"for long positions"
            )
        
        # Check stop distance
        stop_distance_pct = (entry_price - stop_loss) / entry_price * 100
        
        # Too tight (<0.5% below entry)
        if stop_distance_pct < 0.5:
            return False, f"stop_loss too tight: only {stop_distance_pct:.2f}% below entry"
        
        # Too wide (>20% below entry)
        if stop_distance_pct > 20:
            return False, f"stop_loss too wide: {stop_distance_pct:.2f}% below entry"
    
    else:  # short
        # Short: stop must be above entry
        if stop_loss <= entry_price:
            return False, (
                f"stop_loss ${stop_loss:.2f} must be above entry_price ${entry_price:.2f} "
                f"for short positions"
            )
        
        # Check stop distance
        stop_distance_pct = (stop_loss - entry_price) / entry_price * 100
        
        # Too tight (<0.5% above entry)
        if stop_distance_pct < 0.5:
            return False, f"stop_loss too tight: only {stop_distance_pct:.2f}% above entry"
        
        # Too wide (>20% above entry)
        if stop_distance_pct > 20:
            return False, f"stop_loss too wide: {stop_distance_pct:.2f}% above entry"
    
    return True, None


def validate_stop_update(
    new_stop: float,
    current_stop: float,
    current_price: float,
    entry_price: float,
    side: str = "long"
) -> tuple[bool, Optional[str]]:
    """
    Validate stop loss updates are safe.
    
    Ensures stop updates follow proper risk management:
    - Never lower a long stop or raise a short stop
    - Stop remains on correct side of current price
    - Stop doesn't move too far from reasonable levels
    
    Args:
        new_stop: Proposed new stop loss
        current_stop: Current stop loss
        current_price: Current market price
        entry_price: Original entry price
        side: "long" or "short" position
        
    Returns:
        (is_valid, error_message)
    """
    # Check for NaN or infinity
    if not math.isfinite(new_stop):
        return False, f"new_stop_loss is not finite: {new_stop}"
    
    if new_stop <= 0:
        return False, f"new_stop must be positive: {new_stop}"
    
    if side.lower() == "long":
        # Long positions: never lower the stop
        if new_stop < current_stop:
            return False, f"Cannot lower stop from ${current_stop:.2f} to ${new_stop:.2f}"
        
        # Stop must be below current price
        if new_stop >= current_price:
            return False, (
                f"Stop ${new_stop:.2f} must be below current price ${current_price:.2f}"
            )
        
        # Stop shouldn't be absurdly high (>95% of current price)
        if new_stop > current_price * 0.95:
            return False, (
                f"Stop ${new_stop:.2f} too close to current price ${current_price:.2f}"
            )
        
        # Stop shouldn't be below entry price by more than 20%
        if new_stop < entry_price * 0.80:
            return False, (
                f"Stop ${new_stop:.2f} too far below entry ${entry_price:.2f}"
            )
    
    else:  # short
        # Short positions: never raise the stop
        if new_stop > current_stop:
            return False, f"Cannot raise stop from ${current_stop:.2f} to ${new_stop:.2f}"
        
        # Stop must be above current price
        if new_stop <= current_price:
            return False, (
                f"Stop ${new_stop:.2f} must be above current price ${current_price:.2f}"
            )
        
        # Stop shouldn't be absurdly low (within 5% of current price)
        if new_stop < current_price * 1.05:
            return False, (
                f"Stop ${new_stop:.2f} too close to current price ${current_price:.2f}"
            )
        
        # Stop shouldn't be above entry price by more than 20%
        if new_stop > entry_price * 1.20:
            return False, (
                f"Stop ${new_stop:.2f} too far above entry ${entry_price:.2f}"
            )
    
    return True, None


def validate_price_distance(
    price1: float,
    price2: float,
    max_percent: float = 50.0
) -> tuple[bool, Optional[str]]:
    """
    Validate two prices are within reasonable distance of each other.
    
    Useful for checking if a target price is realistic relative to
    current or entry price.
    
    Args:
        price1: First price (e.g., current price)
        price2: Second price (e.g., target price)
        max_percent: Maximum allowed percentage difference
        
    Returns:
        (is_valid, error_message)
    """
    if not math.isfinite(price1) or price1 <= 0:
        return False, f"price1 is invalid: {price1}"
    
    if not math.isfinite(price2) or price2 <= 0:
        return False, f"price2 is invalid: {price2}"
    
    diff_pct = abs(price2 - price1) / price1 * 100
    
    if diff_pct > max_percent:
        return False, (
            f"Price ${price2:.2f} is {diff_pct:.1f}% away from ${price1:.2f}, "
            f"exceeds max of {max_percent:.1f}%"
        )
    
    return True, None


def validate_position_size(
    position_size: float,
    fund_balance: float,
    max_bet_percent: Optional[float] = None,
    min_position_size: float = 0.01
) -> tuple[bool, Optional[str]]:
    """
    Validate position size is reasonable.
    
    Args:
        position_size: Proposed position size in dollars
        fund_balance: Available fund balance
        max_bet_percent: Maximum percentage of balance to risk (optional)
        min_position_size: Minimum position size (default: $0.01)
        
    Returns:
        (is_valid, error_message)
    """
    if position_size < min_position_size:
        return False, f"Position size ${position_size:.2f} below minimum ${min_position_size:.2f}"
    
    if position_size > fund_balance:
        return False, (
            f"Position size ${position_size:.2f} exceeds fund balance ${fund_balance:.2f}"
        )
    
    if max_bet_percent is not None and max_bet_percent > 0:
        max_position = fund_balance * (max_bet_percent / 100.0)
        if position_size > max_position:
            return False, (
                f"Position size ${position_size:.2f} exceeds max bet "
                f"{max_bet_percent}% of balance (${max_position:.2f})"
            )
    
    return True, None


def validate_quantity(
    quantity: float,
    price: float,
    min_quantity: float = 0.001
) -> tuple[bool, Optional[str]]:
    """
    Validate trade quantity is reasonable.
    
    Args:
        quantity: Number of shares
        price: Price per share
        min_quantity: Minimum quantity (default: 0.001 for fractional shares)
        
    Returns:
        (is_valid, error_message)
    """
    if quantity < min_quantity:
        return False, f"Quantity {quantity:.4f} below minimum {min_quantity:.4f}"
    
    if not math.isfinite(quantity) or quantity <= 0:
        return False, f"Invalid quantity: {quantity}"
    
    if not math.isfinite(price) or price <= 0:
        return False, f"Invalid price: {price}"
    
    # Check that total value is reasonable (not too small)
    total_value = quantity * price
    if total_value < 0.01:  # Less than 1 cent
        return False, f"Total value ${total_value:.4f} too small (min: $0.01)"
    
    return True, None


