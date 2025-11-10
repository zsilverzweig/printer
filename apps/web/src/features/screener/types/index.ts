export type StockData = {
  ticker: string;
  price: number;
  today_vol: number;
  rv14: number;
  rv_lw: number;
  type?: string;
  primary_exchange?: string | null;
  sic_description?: string | null;
  market_cap?: number | null;
  public_float?: number | null;
};
