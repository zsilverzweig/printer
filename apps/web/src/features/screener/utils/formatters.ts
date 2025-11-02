export function formatNumber(n: number | undefined): string {
  if (typeof n !== "number") return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatMultiple(n: number | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  return `${n.toFixed(2)}x`;
}

export function formatPercent(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
