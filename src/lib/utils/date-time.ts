/**
 * Date and time formatting utilities
 * Server always works in UTC, client converts to ET (America/New_York)
 */

import { useEffect, useMemo, useState } from "react";

/**
 * Format a UTC ISO string to a localized date/time string
 */
export function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

/**
 * Convert UTC timestamp to US/Eastern (ET) string for display
 */
export function formatET(utcIso: string): string {
  try {
    const d = new Date(utcIso);
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return utcIso;
  }
}

/**
 * Format UTC timestamp to ET time only (no date)
 */
export function formatETTime(utcIso: string): string {
  try {
    const d = new Date(utcIso);
    return d.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return utcIso;
  }
}

/**
 * Live "time since" counter hook that updates every 60 seconds
 * Returns a human-readable string like "5m ago", "2h ago", "3d ago"
 */
export function useTimeSince(isoUtc?: string): string {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!isoUtc) return "";
    const eventMs = new Date(isoUtc).getTime();
    const diffSec = Math.max(0, Math.floor((now - eventMs) / 1000));

    if (diffSec < 60) return `${diffSec}s ago`;

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }, [isoUtc, now]);
}

/**
 * Calculate time difference between now and a timestamp
 * Returns the difference in a human-readable format without "ago" suffix
 */
export function getTimeDifference(isoUtc: string): string {
  try {
    const eventMs = new Date(isoUtc).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - eventMs) / 1000));

    if (diffSec < 60) return `${diffSec}s`;

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;

    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d`;
  } catch {
    return "";
  }
}
