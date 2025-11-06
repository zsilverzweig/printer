#!/bin/bash
# Test script for ticker lifecycle progression
# Tests the Monkey Darts fund to verify tickers are moving through states

FUND_ID="ebc3e4a4-c789-4248-acd2-daf79b93bd5d"
API_BASE="http://localhost:8000/api"

echo "=========================================="
echo "Testing Ticker Lifecycle Progression"
echo "Fund ID: $FUND_ID"
echo "=========================================="
echo ""

# Function to get state counts
get_state_counts() {
    echo "📊 Current State Distribution:"
    curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states" | \
        jq -r '[group_by(.current_state)[] | {state: .[0].current_state, count: length}] | 
                sort_by(.state) | 
                .[] | "  \(.state): \(.count)"'
    echo ""
}

# Function to get sample tickers in a state
get_sample_tickers() {
    local state=$1
    local limit=${2:-5}
    echo "📋 Sample tickers in '${state}' state (showing ${limit}):"
    curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=${state}" | \
        jq -r ".[0:${limit}] | .[] | \"  - \(.ticker) (updated: \(.updated_at))\""
    echo ""
}

# Function to get a specific ticker's state
get_ticker_state() {
    local ticker=$1
    echo "🔍 State for ticker ${ticker}:"
    curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${ticker}" | \
        jq -r '"  Current State: \(.current_state)",
               "  Last Screened: \(.last_screened_at // "N/A")",
               "  Entry Level ID: \(.entry_level_id // "N/A")",
               "  Trade ID: \(.trade_id // "N/A")",
               "  Transitions: \(.state_transitions | length)",
               "  Latest Transition: \(.state_transitions[-1].transition_code // "N/A")"'
    echo ""
}

# Function to get full transition history
get_transition_history() {
    local ticker=$1
    echo "📜 Full Transition History for ${ticker}:"
    curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${ticker}/history" | \
        jq -r '.transitions[] | "  [\(.timestamp)] \(.from_state // "null") → \(.to_state) (\(.transition_code)): \(.description)"'
    echo ""
}

echo "1. Initial State Distribution"
get_state_counts

echo "2. Sample Screened Tickers"
get_sample_tickers "screened" 5

echo "3. Sample Setup Tickers"
get_sample_tickers "setup" 5

if [ -n "$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=entered" | jq -r '.[0].ticker // empty')" ]; then
    echo "4. Sample Entered Tickers"
    get_sample_tickers "entered" 5
fi

if [ -n "$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=filled" | jq -r '.[0].ticker // empty')" ]; then
    echo "5. Sample Filled Tickers"
    get_sample_tickers "filled" 5
fi

# Get a specific ticker that's in setup to see its transitions
SETUP_TICKER=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=setup" | jq -r '.[0].ticker // empty')
if [ -n "$SETUP_TICKER" ]; then
    echo "6. Detailed State for Sample Setup Ticker: ${SETUP_TICKER}"
    get_ticker_state "$SETUP_TICKER"
    get_transition_history "$SETUP_TICKER"
fi

# Check if any tickers have multiple transitions (indicating progression)
echo "7. Tickers with Multiple Transitions (showing progression):"
curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states" | \
    jq -r '.[] | select(.state_transitions | length > 1) | 
           "  \(.ticker) (\(.current_state)): \(.state_transitions | length) transitions"' | \
    head -10
echo ""

echo "=========================================="
echo "Test Complete"
echo "=========================================="
