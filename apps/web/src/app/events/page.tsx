'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/lib/components/ui/card';

interface Event {
  id: number;
  type: string;
  timestamp: string;
  // AI Trade Event fields
  ticker?: string;
  action?: string;
  confidence?: number;
  reasoning?: string;
  chart_data_present?: boolean;
  news_data_present?: boolean;
  financial_data_present?: boolean;
  // Alpaca Trade Event fields
  order_id?: string;
  side?: string;
  notional?: number;
  filled_qty?: number;
  filled_avg_price?: number;
  status?: string;
  submitted_at?: string;
  filled_at?: string;
  error_message?: string;
}

type EventFilter = 'all' | 'ai_trade' | 'alpaca_trade';

const FILTER_LABELS: Record<EventFilter, string> = {
  all: 'All Events',
  ai_trade: 'AI Analysis',
  alpaca_trade: 'Alpaca Trades',
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EventFilter>('all');

  useEffect(() => {
    fetchEvents();
  }, [filter]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = filter === 'all' 
        ? 'http://localhost:8000/api/events?limit=100'
        : `http://localhost:8000/api/events?limit=100&event_type=${filter}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatPercent = (n: number | undefined) => {
    if (typeof n !== 'number' || !isFinite(n)) return '-';
    return `${(n * 100).toFixed(1)}%`;
  };

  const formatNumber = (n: number | undefined) => {
    if (typeof n !== 'number') return '-';
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Events</h1>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as EventFilter[]).map((filterKey) => (
          <button
            key={filterKey}
            onClick={() => setFilter(filterKey)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === filterKey
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {FILTER_LABELS[filterKey]}
          </button>
        ))}
        <button
          onClick={fetchEvents}
          className="px-4 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 ml-auto"
        >
          Refresh
        </button>
      </div>

      <Card className="p-4 overflow-x-auto space-y-4">
        {loading && (
          <div className="py-6 text-center text-muted-foreground">
            Loading events...
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="py-6 text-center text-muted-foreground">
            No events found. Events will appear here after AI analysis or trades are executed.
          </div>
        )}

        {!loading && events.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Ticker</th>
                <th className="py-2 text-left">Action/Side</th>
                <th className="py-2 text-right">Confidence</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Details</th>
                <th className="py-2 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const isAITrade = event.type === 'ai_trade';
                const isAlpacaTrade = event.type === 'alpaca_trade';
                const isBuy = event.side === 'buy' || event.action === 'buy';
                const isSell = event.side === 'sell' || event.action === 'sell';
                
                const rowClass = isBuy
                  ? 'bg-emerald-50 dark:bg-emerald-950/30'
                  : isSell
                  ? 'bg-rose-50 dark:bg-rose-950/30'
                  : '';

                return (
                  <tr
                    key={event.id}
                    className={`border-t ${rowClass} hover:bg-muted/50`}
                  >
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          isAITrade
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        }`}
                      >
                        {isAITrade ? 'AI' : 'Trade'}
                      </span>
                    </td>
                    <td className="py-2 font-medium">{event.ticker || '-'}</td>
                    <td className="py-2">
                      {event.action || event.side || '-'}
                    </td>
                    <td className="py-2 text-right">
                      {isAITrade ? formatPercent(event.confidence) : '-'}
                    </td>
                    <td className="py-2 text-right">
                      {isAlpacaTrade && event.notional
                        ? `$${formatNumber(event.notional)}`
                        : '-'}
                    </td>
                    <td className="py-2">
                      {isAlpacaTrade && event.status && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            event.status === 'filled'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : event.status === 'error'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                          }`}
                        >
                          {event.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground max-w-md">
                      {isAITrade && event.reasoning && (
                        <div className="truncate">{event.reasoning}</div>
                      )}
                      {isAITrade && (
                        <div className="flex gap-1 mt-1">
                          {event.chart_data_present && (
                            <span className="text-xs">📊</span>
                          )}
                          {event.news_data_present && (
                            <span className="text-xs">📰</span>
                          )}
                          {event.financial_data_present && (
                            <span className="text-xs">💰</span>
                          )}
                        </div>
                      )}
                      {isAlpacaTrade && event.filled_qty && (
                        <div>
                          Filled: {event.filled_qty} @ $
                          {formatNumber(event.filled_avg_price)}
                        </div>
                      )}
                      {isAlpacaTrade && event.error_message && (
                        <div className="text-red-600 dark:text-red-400">
                          {event.error_message}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right text-xs text-muted-foreground">
                      {formatDate(event.timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && events.length > 0 && (
          <div className="text-sm text-muted-foreground text-center">
            Showing {events.length} events
          </div>
        )}
      </Card>
    </div>
  );
}
