# NOC (Network Operations Center) WebSocket API

## Overview

The NOC WebSocket endpoint provides real-time stock monitoring data with multi-factor signal analysis. It broadcasts updates for a watchlist of stocks with six key trading indicators, each with a color-coded signal (green/yellow/red).

## Endpoint

```
ws://localhost:8000/noc/ws
```

## Connection

Connect using a WebSocket client:

```javascript
const ws = new WebSocket("ws://localhost:8000/noc/ws");

ws.onopen = () => {
  console.log("Connected to NOC stream");
};

ws.onmessage = (event) => {
  const stocks = JSON.parse(event.data);
  console.log("Received NOC data:", stocks);
};
```

## Data Format

The endpoint broadcasts an array of stock objects every 10 seconds (configurable).

### Stock Object Schema

```typescript
{
  ticker: string; // Stock ticker symbol (e.g., "AAPL")
  price: number; // Current price
  priceSignal: string; // "green" | "yellow" | "red"
  changePercent: number; // Yesterday's change percentage
  changeSignal: string; // "green" | "yellow" | "red"
  relativeVolume: number; // Time-adjusted relative volume
  rvSignal: string; // "green" | "yellow" | "red"
  newsSentiment: string; // "Positive" | "Neutral" | "Negative"
  newsSignal: string; // "green" | "yellow" | "red"
  float: string; // Shares trading (e.g., "2.5B")
  floatSignal: string; // "green" | "yellow" | "red"
  bullFlag: boolean; // Bull flag pattern detected
  flagSignal: string; // "green" | "yellow" | "red"
}
```

### Example Response

```json
[
  {
    "ticker": "AAPL",
    "price": 178.25,
    "priceSignal": "green",
    "changePercent": 2.34,
    "changeSignal": "green",
    "relativeVolume": 1.45,
    "rvSignal": "green",
    "newsSentiment": "Positive",
    "newsSignal": "green",
    "float": "15.3B",
    "floatSignal": "yellow",
    "bullFlag": true,
    "flagSignal": "green"
  },
  {
    "ticker": "TSLA",
    "price": 242.84,
    "priceSignal": "green",
    "changePercent": -1.23,
    "changeSignal": "red",
    "relativeVolume": 2.15,
    "rvSignal": "green",
    "newsSentiment": "Mixed",
    "newsSignal": "yellow",
    "float": "3.2B",
    "floatSignal": "green",
    "bullFlag": false,
    "flagSignal": "red"
  }
]
```

## Signal Logic

### Price Signal

- **Green**: Price in tradeable range ($2-$20)
- **Yellow**: Price acceptable but not ideal ($1-$50)
- **Red**: Price too low (<$1) or too high (>$50)

### Change Signal

- **Green**: Change ≥ 2.0%
- **Yellow**: Change ≥ 0%
- **Red**: Change < 0%

### Relative Volume Signal

- **Green**: RV ≥ 1.5x
- **Yellow**: RV ≥ 1.0x
- **Red**: RV < 1.0x

### News Signal

- AI-generated sentiment analysis (green = positive, yellow = neutral, red = negative)

### Float Signal

- Based on shares outstanding (green = ideal range, yellow = acceptable, red = too high/low)

### Bull Flag Signal

- **Green**: Pattern detected
- **Red**: No pattern

## Trading Strategy

When all six signals show **green**, the stock is considered ready for trade. This indicates:

- ✅ Strong price action
- ✅ Positive momentum (change %)
- ✅ High relative volume
- ✅ Positive news sentiment
- ✅ Ideal float range
- ✅ Bull flag pattern detected

## Configuration

### Data Source

The NOC service uses **ScreenerService** as its data source, which:

- Fetches market snapshots from Polygon every 20 seconds
- Filters for stocks from major US exchanges:
  - NASDAQ (XNAS)
  - NYSE (XNYS)
  - NYSE Arca (ARCX)
  - NYSE American (XASE)
- Filters for stocks priced $2-$20 that are up 5%+ from yesterday
- Sorts by relative volume (RV14)
- Returns top 200 stocks

The NOC takes the **top 50 stocks** from the screener and enriches them with additional indicators.

### Update Interval

Default: 10 seconds (configurable via `NocService` constructor)

```python
noc_service = NocService(rest_client, interval_s=10)
```

## Implementation Status

### Current (Hybrid Real + Mock Data)

The service currently uses **real data from ScreenerService** for core metrics:

- ✅ **Real-time prices** from Polygon snapshots
- ✅ **Real % change** calculated from yesterday's close to current price
- ✅ **Real relative volume** (RV14) from historical data
- ✅ WebSocket connectivity
- ✅ Real-time broadcasting (10 second updates)
- ✅ Signal calculation logic
- ✅ Subscriber management

**Mock indicators** (to be replaced):

- ⚠️ News sentiment (correlated with price movement for realism)
- ⚠️ Float data (random values)
- ⚠️ Bull flag detection (correlated with momentum)

### TODO (Full Production Data)

Replace remaining mock indicators with real data sources:

- [ ] Integrate AI sentiment analysis for news (OpenAI API)
- [ ] Implement bull flag pattern detection algorithms
- [ ] Fetch float data from Polygon company information endpoint
- [ ] Add time-adjusted intraday RV (vs same time periods)

## Frontend Integration

Example using React hooks:

```typescript
import { useWebSocket } from "@/lib/hooks/use-websocket";

function NocDashboard() {
  const { lastMessage, isConnected } = useWebSocket<StockData[]>(
    "ws://localhost:8000/noc/ws",
    { autoReconnect: true }
  );

  return (
    <div>
      <h1>NOC Dashboard {isConnected ? "🟢" : "🔴"}</h1>
      {lastMessage?.map((stock) => (
        <StockRow key={stock.ticker} stock={stock} />
      ))}
    </div>
  );
}
```

## Error Handling

The service implements automatic reconnection and error logging:

- Failed connections are logged
- Broadcast errors are caught per-subscriber
- Service continues running even if individual ticks fail

## Performance

- **Latency**: ~10-50ms per broadcast
- **Concurrent connections**: Unlimited (limited by system resources)
- **Memory usage**: ~1MB per 1000 subscribers
- **CPU usage**: Minimal (event-driven architecture)
