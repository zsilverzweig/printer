"""
Trading Constants

Standard constants for float comparisons and validation across the trading system.
These ensure consistent tolerance values for position, balance, and quantity checks.
"""

# Position quantity tolerance (for position checks)
# Used when checking if a position exists or is sufficient for selling
POSITION_EPSILON = 0.01

# Balance tolerance (for cash balance checks)
# Used when validating available balance for buy orders
BALANCE_EPSILON = 0.01

# General float comparison tolerance
# Used for general float equality checks (smaller tolerance for precision)
FLOAT_COMPARISON_EPSILON = 0.001

