#!/bin/bash
# Comprehensive lifecycle monitoring script
# Tests the full ticker lifecycle progression through all states

FUND_ID="ebc3e4a4-c789-4248-acd2-daf79b93bd5d"
API_BASE="http://localhost:8000/api"
MAX_ITERATIONS=20
ITERATION_DELAY=10

echo "=========================================="
echo "Full Lifecycle Progression Test"
echo "Fund ID: $FUND_ID"
echo "Monitoring for up to $((MAX_ITERATIONS * ITERATION_DELAY / 60)) minutes"
echo "=========================================="
echo ""

# Track progression over time
iteration=0

while [ $iteration -lt $MAX_ITERATIONS ]; do
    iteration=$((iteration + 1))
    echo "--- Iteration $iteration/$MAX_ITERATIONS ($(date +%H:%M:%S)) ---"
    
    # Get current state distribution
    state_counts=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states" | \
        jq -r '[group_by(.current_state)[] | {state: .[0].current_state, count: length}] | 
                sort_by(.state) | 
                .[] | "\(.state):\(.count)"')
    
    echo "📊 State Distribution:"
    for state_count in $state_counts; do
        state=$(echo $state_count | cut -d: -f1)
        count=$(echo $state_count | cut -d: -f2)
        echo "  $state: $count"
    done
    echo ""
    
    # Check for progression indicators
    screened=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=screened" | jq 'length')
    setup=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=setup" | jq 'length')
    entered=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=entered" | jq 'length')
    filled=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=filled" | jq 'length')
    exited=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=exited" | jq 'length')
    
    # Check for entry levels (tickers with entry_level_id)
    entered_with_levels=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=entered" | \
        jq '[.[] | select(.entry_level_id != null)] | length')
    
    # Check for trades (tickers with trade_id)
    filled_with_trades=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=filled" | \
        jq '[.[] | select(.trade_id != null)] | length')
    exited_with_trades=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=exited" | \
        jq '[.[] | select(.trade_id != null)] | length')
    
    echo "🔍 Progression Analysis:"
    echo "  Screened → Setup: $screened → $setup ($(echo "scale=1; $setup * 100 / ($screened + $setup)" | bc)%)"
    echo "  Setup → Entered: $setup → $entered ($(echo "scale=1; $entered * 100 / ($setup + 1)" | bc)%)"
    echo "  Entered → Filled: $entered → $filled ($(echo "scale=1; $filled * 100 / ($entered + 1)" | bc)%)"
    echo "  Filled → Exited: $filled → $exited ($(echo "scale=1; $exited * 100 / ($filled + 1)" | bc)%)"
    echo ""
    
    echo "📋 Entry Level Status:"
    echo "  Entered tickers with entry_level_id: $entered_with_levels / $entered"
    if [ "$entered" -gt 0 ] && [ "$entered_with_levels" -lt "$entered" ]; then
        echo "  ⚠️  WARNING: Some entered tickers missing entry_level_id!"
    fi
    echo ""
    
    echo "💼 Trade Status:"
    echo "  Filled tickers with trade_id: $filled_with_trades / $filled"
    echo "  Exited tickers with trade_id: $exited_with_trades / $exited"
    if [ "$filled" -gt 0 ] && [ "$filled_with_trades" -lt "$filled" ]; then
        echo "  ⚠️  WARNING: Some filled tickers missing trade_id!"
    fi
    echo ""
    
    # Sample a ticker from each state to check transitions
    if [ "$setup" -gt 0 ]; then
        setup_ticker=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=setup" | jq -r '.[0].ticker')
        setup_transitions=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${setup_ticker}" | \
            jq '.state_transitions | length')
        echo "📈 Sample Setup Ticker ($setup_ticker): $setup_transitions transitions"
    fi
    
    if [ "$entered" -gt 0 ]; then
        entered_ticker=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=entered" | jq -r '.[0].ticker')
        entered_transitions=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${entered_ticker}" | \
            jq '.state_transitions | length')
        entry_level_id=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${entered_ticker}" | \
            jq -r '.entry_level_id // "MISSING"')
        echo "📈 Sample Entered Ticker ($entered_ticker): $entered_transitions transitions, entry_level_id: $entry_level_id"
    fi
    
    if [ "$filled" -gt 0 ]; then
        filled_ticker=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=filled" | jq -r '.[0].ticker')
        filled_transitions=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${filled_ticker}" | \
            jq '.state_transitions | length')
        trade_id=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${filled_ticker}" | \
            jq -r '.trade_id // "MISSING"')
        echo "📈 Sample Filled Ticker ($filled_ticker): $filled_transitions transitions, trade_id: $trade_id"
    fi
    
    if [ "$exited" -gt 0 ]; then
        exited_ticker=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states?state=exited" | jq -r '.[0].ticker')
        exited_transitions=$(curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${exited_ticker}" | \
            jq '.state_transitions | length')
        echo "📈 Sample Exited Ticker ($exited_ticker): $exited_transitions transitions"
        
        # Show full transition history
        echo "  Full history:"
        curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states/${exited_ticker}/history" | \
            jq -r '.transitions[] | "    [\(.timestamp)] \(.from_state // "null") → \(.to_state) (\(.transition_code))"'
    fi
    
    echo ""
    echo "⏳ Waiting ${ITERATION_DELAY}s before next check..."
    echo ""
    
    sleep $ITERATION_DELAY
done

echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo ""
echo "Summary of state progression:"
echo "Final counts:"
curl -s "${API_BASE}/funds/${FUND_ID}/ticker-states" | \
    jq -r '[group_by(.current_state)[] | {state: .[0].current_state, count: length}] | 
            sort_by(.state) | 
            .[] | "  \(.state): \(.count)"'

