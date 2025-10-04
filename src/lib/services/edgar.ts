import { log } from "@/lib/utils/logger";

export interface EdgarFilingSummary {
  accessionNumber: string;
  formType: string;
  filingDate: string;
  reportDate?: string | null;
  primaryDocument: string;
  description?: string | null;
  documentUrl: string;
  filingDetailUrl: string;
  items?: string | null;
}

export interface EdgarFilingsResult {
  companyName: string;
  cik: string;
  ticker: string;
  lastUpdated?: string;
  filings: EdgarFilingSummary[];
}

class EdgarService {
  private static instance: EdgarService;
  private tickerMap: Map<string, string> | null = null;
  private tickerMapFetchedAt: number | null = null;
  private tickerMapPromise: Promise<Map<string, string>> | null = null;
  private readonly tickerCacheTtl = 1000 * 60 * 60 * 24; // 24 hours

  static getInstance(): EdgarService {
    if (!EdgarService.instance) {
      EdgarService.instance = new EdgarService();
    }
    return EdgarService.instance;
  }

  private getBaseUrl(): string {
    return process.env.SEC_EDGAR_API_BASE_URL || "https://data.sec.gov";
  }

  private getUserAgent(): string {
    const userAgent = process.env.SEC_EDGAR_USER_AGENT;
    if (!userAgent) {
      throw new Error(
        "SEC_EDGAR_USER_AGENT is not configured. Please set it in your environment variables."
      );
    }
    return userAgent;
  }

  private getApiKey(): string | undefined {
    return process.env.SEC_EDGAR_API_KEY || undefined;
  }

  private buildRequestHeaders(accept: string): HeadersInit {
    const headers: Record<string, string> = {
      "User-Agent": this.getUserAgent(),
      Accept: accept,
    };

    const apiKey = this.getApiKey();
    if (apiKey) {
      headers["X-API-KEY"] = apiKey;
    }

    return headers;
  }

  private async ensureTickerMap(): Promise<Map<string, string>> {
    if (
      this.tickerMap &&
      this.tickerMapFetchedAt &&
      Date.now() - this.tickerMapFetchedAt < this.tickerCacheTtl
    ) {
      return this.tickerMap;
    }

    if (this.tickerMapPromise) {
      return this.tickerMapPromise;
    }

    this.tickerMapPromise = this.fetchTickerMap();

    try {
      const tickerMap = await this.tickerMapPromise;
      this.tickerMap = tickerMap;
      this.tickerMapFetchedAt = Date.now();
      return tickerMap;
    } finally {
      this.tickerMapPromise = null;
    }
  }

  private async fetchTickerMap(): Promise<Map<string, string>> {
    const url = "https://www.sec.gov/include/ticker.txt";

    log.info("Fetching SEC ticker map", { url }, "EdgarService");

    const response = await fetch(url, {
      headers: this.buildRequestHeaders("text/plain"),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ticker mapping from SEC (status ${response.status})`
      );
    }

    const text = await response.text();
    const map = new Map<string, string>();

    text.split("\n").forEach((line) => {
      const [ticker, cik] = line.trim().split("|");
      if (ticker && cik) {
        map.set(ticker.toUpperCase(), cik.padStart(10, "0"));
      }
    });

    if (map.size === 0) {
      throw new Error("SEC ticker mapping response was empty");
    }

    log.success("SEC ticker map loaded", { count: map.size }, "EdgarService");

    return map;
  }

  private async lookupCik(ticker: string): Promise<string> {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) {
      throw new Error("Ticker symbol is required");
    }

    const tickerMap = await this.ensureTickerMap();
    const cik = tickerMap.get(normalizedTicker);

    if (!cik) {
      throw new Error(`No CIK found for ticker ${normalizedTicker}`);
    }

    return cik;
  }

  private buildArchiveUrls(
    cik: string,
    accessionNumber: string,
    primaryDocument: string
  ): { documentUrl: string; filingDetailUrl: string } {
    const numericCik = parseInt(cik, 10).toString();
    const accessionWithoutDashes = accessionNumber.replace(/-/g, "");
    const archiveBase = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionWithoutDashes}`;

    return {
      documentUrl: `${archiveBase}/${primaryDocument}`,
      filingDetailUrl: `${archiveBase}-index.html`,
    };
  }

  async getRecentFilingsByTicker(
    ticker: string,
    limit = 10
  ): Promise<EdgarFilingsResult> {
    if (!ticker) {
      throw new Error("Ticker symbol is required");
    }

    const cik = await this.lookupCik(ticker);
    const normalizedTicker = ticker.trim().toUpperCase();
    const url = `${this.getBaseUrl()}/submissions/CIK${cik}.json`;

    log.info("Fetching SEC filings", { url, ticker: normalizedTicker }, "EdgarService");

    const response = await fetch(url, {
      headers: this.buildRequestHeaders("application/json"),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch filings for ${normalizedTicker} (status ${response.status})`
      );
    }

    const data = await response.json();
    const recent = data?.filings?.recent;

    if (!recent || !Array.isArray(recent.form)) {
      return {
        companyName: data?.name || normalizedTicker,
        cik,
        ticker: normalizedTicker,
        filings: [],
      };
    }

    const filings: EdgarFilingSummary[] = recent.form
      .slice(0, limit)
      .map((formType: string, index: number) => {
        const accessionNumber = recent.accessionNumber?.[index] ?? "";
        const primaryDocument = recent.primaryDocument?.[index] ?? "";
        const { documentUrl, filingDetailUrl } = this.buildArchiveUrls(
          cik,
          accessionNumber,
          primaryDocument
        );

        return {
          accessionNumber,
          formType,
          filingDate: recent.filingDate?.[index] ?? "",
          reportDate: recent.reportDate?.[index] ?? null,
          primaryDocument,
          description: recent.primaryDocDescription?.[index] ?? null,
          items: recent.items?.[index] ?? null,
          documentUrl,
          filingDetailUrl,
        };
      })
      .filter((filing) => filing.accessionNumber && filing.primaryDocument);

    return {
      companyName: data?.name || normalizedTicker,
      cik,
      ticker: normalizedTicker,
      lastUpdated: data?.filings?.files?.[0]?.filingDate || recent.filingDate?.[0],
      filings,
    };
  }
}

export const edgarService = EdgarService.getInstance();
