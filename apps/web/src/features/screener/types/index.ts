export type StockData = {
  ticker: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  today_vol?: number;
  rv14?: number;
  rv?: number;
  change_close_pct?: number;
  change_close?: number;
  change_1m?: number;
  change_5m?: number;
  change_1h?: number;
};
