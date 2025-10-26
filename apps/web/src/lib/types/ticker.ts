/**
 * Ticker details from Polygon API
 */
export interface TickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name?: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  market_cap?: number;
  phone_number?: string;
  address?: {
    address1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  description?: string;
  sic_code?: string;
  sic_description?: string;
  ticker_root?: string;
  homepage_url?: string;
  total_employees?: number;
  list_date?: string;
  branding?: {
    logo_url?: string;
    icon_url?: string;
  };
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
}

/**
 * Financial data from Polygon API
 */
export interface FinancialData {
  ticker: string;
  results: FinancialResult[];
  count: number;
  error?: string;
}

export interface FinancialResult {
  id: string;
  start_date: string;
  end_date: string;
  filing_date?: string;
  acceptance_datetime?: string;
  timeframe: "quarterly" | "annual" | "ttm";
  fiscal_period?: string;
  fiscal_year?: string;
  cik?: string;
  sic?: string;
  tickers?: string[];
  company_name?: string;
  source_filing_url?: string;
  source_filing_file_url?: string;
  financials?: {
    balance_sheet?: {
      assets?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      current_assets?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      liabilities?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      current_liabilities?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      equity?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
    };
    income_statement?: {
      revenues?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      cost_of_revenue?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      gross_profit?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      operating_expenses?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      operating_income?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      net_income_loss?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      basic_earnings_per_share?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      diluted_earnings_per_share?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
    };
    cash_flow_statement?: {
      net_cash_flow_from_operating_activities?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      net_cash_flow_from_investing_activities?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
      net_cash_flow_from_financing_activities?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
    };
    comprehensive_income?: {
      comprehensive_income_loss?: {
        value?: number;
        unit?: string;
        label?: string;
        order?: number;
      };
    };
  };
}
