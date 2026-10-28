import { KAPDisclosure } from '../types.js';
import { InstrumentUniverseService } from './instrumentUniverseService.js';

export interface BurkutKapRawItem {
  id: string;
  symbol: string;
  title: string;
  summary?: string;
  short_description?: string;
  publishDate: string;
}

export interface BurkutKapPageResponse {
  data: {
    content: BurkutKapRawItem[];
    totalElements: number;
    totalPages: number;
    size: number;
    number: number;
    first: boolean;
    last: boolean;
    empty: boolean;
  };
}

export interface BurkutStockQuote {
  symbol: string;
  name: string;
  price: number;
  currentPrice: number;
  change: number;
  changePercent: number;
  dailyChangePct: number;
  volume: number;
  updatedAt: string;
  lastSync: string;
  freshness: string;
  stale: boolean;
  instrumentType: string;
  icon?: string;
  logo?: string;
}

export class BurkutApiClient {
  private static instance: BurkutApiClient;
  private baseUrl: string;
  private apiKey: string;
  private universeService: InstrumentUniverseService;

  // Rate limit & quota tracking from response headers
  private quotaLimit: number = 1000;
  private quotaRemaining: number = 1000;
  private rateLimit: number = 10;
  private rateRemaining: number = 10;
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;

  // In-memory cache to protect API quota & rate limits (TTL: 90 seconds)
  private kapFeedCache: { timestamp: number; items: KAPDisclosure[]; totalElements: number } | null = null;
  private symbolKapCache: Map<string, { timestamp: number; items: KAPDisclosure[] }> = new Map();
  private stocksCache: { timestamp: number; items: BurkutStockQuote[] } | null = null;
  private singleStockCache: Map<string, { timestamp: number; item: BurkutStockQuote }> = new Map();
  private readonly CACHE_TTL_MS = 90_000;

  constructor() {
    this.baseUrl = (process.env.BURKUT_API_URL || 'https://api.burkutportfoy.com/api/public/v1').replace(/\/+$/, '');
    this.apiKey =
      process.env.BURKUT_API_KEY ||
      'bk_live_5iISyv99ubQiqxHp_f83PGNrn6S23i27CvzTQoJLm_k0lfYbW8p1eEkMvcr0';
    this.universeService = InstrumentUniverseService.getInstance();
  }

  public static getInstance(): BurkutApiClient {
    if (!BurkutApiClient.instance) {
      BurkutApiClient.instance = new BurkutApiClient();
    }
    return BurkutApiClient.instance;
  }

  public getStatus() {
    return {
      provider: 'Bürküt Portföy REST API (v1)',
      baseUrl: this.baseUrl,
      isConfigured: Boolean(this.apiKey),
      quotaLimit: this.quotaLimit,
      quotaRemaining: this.quotaRemaining,
      rateLimit: this.rateLimit,
      rateRemaining: this.rateRemaining,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError
    };
  }

  private updateHeadersTelemetry(headers: Headers) {
    const qLim = headers.get('x-quota-limit');
    const qRem = headers.get('x-quota-remaining');
    const rLim = headers.get('x-ratelimit-limit');
    const rRem = headers.get('x-ratelimit-remaining');
    if (qLim) this.quotaLimit = parseInt(qLim, 10) || this.quotaLimit;
    if (qRem) this.quotaRemaining = parseInt(qRem, 10) || this.quotaRemaining;
    if (rLim) this.rateLimit = parseInt(rLim, 10) || this.rateLimit;
    if (rRem) this.rateRemaining = parseInt(rRem, 10) || this.rateRemaining;
  }

  private categorizeDisclosure(title: string, summary: string): KAPDisclosure['category'] {
    const text = `${title} ${summary}`.toUpperCase();
    if (
      text.includes('FİNANSAL') ||
      text.includes('FINANSAL') ||
      text.includes('BİLANÇO') ||
      text.includes('FAALİYET RAPORU') ||
      text.includes('FAALIYET RAPORU') ||
      text.includes('SORUMLULUK BEYANI')
    ) {
      return 'Finansal Rapor';
    }
    if (
      text.includes('TEMETTÜ') ||
      text.includes('KAR PAYI') ||
      text.includes('KÂR PAYI') ||
      text.includes('SERMAYE') ||
      text.includes('BEDELLİ') ||
      text.includes('BEDELSİZ')
    ) {
      return 'Temettü / Sermaye';
    }
    if (text.includes('HALKA ARZ') || text.includes('İZAHNAME')) {
      return 'Halka Arz';
    }
    if (text.includes('GENEL KURUL') || text.includes('YÖNETİM KURULU')) {
      return 'Şirket Kararı';
    }
    return 'Özel Durum';
  }

  private evaluateSentimentAndScore(title: string, summary: string): {
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    score: number;
    aiSummary: string;
  } {
    const text = `${title} ${summary}`.toLowerCase();
    let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
    let score = 6.5;

    if (
      text.includes('sözleşme') ||
      text.includes('sipariş') ||
      text.includes('ihale') ||
      text.includes('yatırım') ||
      text.includes('temettü') ||
      text.includes('kâr payı') ||
      text.includes('derecelendirme') ||
      text.includes('mutabakat') ||
      text.includes('artış')
    ) {
      sentiment = 'POSITIVE';
      score = 8.2;
    } else if (
      text.includes('iptal') ||
      text.includes('ceza') ||
      text.includes('dava') ||
      text.includes('zarar') ||
      text.includes('duruş')
    ) {
      sentiment = 'NEGATIVE';
      score = 3.5;
    } else if (text.includes('finansal rapor') || text.includes('faaliyet raporu')) {
      sentiment = 'POSITIVE';
      score = 7.6;
    }

    const aiSummary = summary
      ? `${title}: ${summary}. Bürküt Portföy KAP veri akışı üzerinden doğrulanan bu bildirim şirket faaliyetleri ve yatırımcı bilgilendirmesi kapsamında değerlendirilmiştir.`
      : `${title} başlıklı resmî KAP bildirimi.`;

    return { sentiment, score, aiSummary };
  }

  public normalizeKapItem(raw: BurkutKapRawItem): KAPDisclosure {
    const sym = (raw.symbol || '').toUpperCase().trim();
    const shortDesc = raw.short_description || '';
    const linkMatch = shortDesc.match(/https:\/\/www\.kap\.org\.tr\/tr\/Bildirim\/(\d+)/i);
    const disclosureIndex = linkMatch ? linkMatch[1] : raw.id;
    const originalUrl = linkMatch
      ? `https://www.kap.org.tr/tr/Bildirim/${linkMatch[1]}`
      : `https://www.kap.org.tr/tr/sirket-bilgileri/ozet/${sym}`;

    const cleanedOriginalText = shortDesc
      .replace(/Orjinal Link:\s*https:\/\/www\.kap\.org\.tr\/tr\/Bildirim\/\d+\s*/i, '')
      .trim();

    const summaryText = raw.summary || cleanedOriginalText || raw.title;
    const displayTitle =
      raw.summary && raw.summary.length > 5 && raw.title !== raw.summary
        ? `${raw.title} — ${raw.summary}`
        : raw.title;

    const stockRec = this.universeService.getStock(sym);
    const companyTitle = stockRec?.name || sym;
    const category = this.categorizeDisclosure(raw.title || '', summaryText);
    const { sentiment, score, aiSummary } = this.evaluateSentimentAndScore(raw.title || '', summaryText);

    const pubDateStr = raw.publishDate || new Date().toISOString();
    const timePartMatch = pubDateStr.match(/T(\d{2}:\d{2}(:\d{2})?)/);
    const publishTime = timePartMatch ? timePartMatch[1] : '18:00:00';

    return {
      id: `burkut_${disclosureIndex}_${sym}`,
      disclosureIndex,
      symbol: sym,
      companyTitle,
      publishDate: pubDateStr,
      publishTime,
      title: displayTitle,
      summary: summaryText,
      originalText: cleanedOriginalText || summaryText,
      aiSummary,
      category,
      isImportant:
        category === 'Finansal Rapor' ||
        category === 'Temettü / Sermaye' ||
        raw.title?.toUpperCase().includes('ÖZEL DURUM') ||
        false,
      disclosureType: raw.title || 'Özel Durum Açıklaması (ÖDA)',
      originalUrl,
      isVerified: true,
      source: 'Bürküt Portföy REST API / KAP Canlı Akış',
      financialImpactScore: score,
      sentiment,
      dataSource: 'BURKUT_KAP_API'
    };
  }

  /**
   * Fetches latest KAP disclosures from Bürküt Portföy API (/kap?page=0&size=20)
   */
  public async fetchKapDisclosures(options?: {
    page?: number;
    size?: number;
    symbol?: string;
    forceRefresh?: boolean;
  }): Promise<{ items: KAPDisclosure[]; totalElements: number }> {
    const page = options?.page ?? 0;
    const size = Math.min(options?.size ?? 20, 50);
    const symbol = options?.symbol ? options.symbol.toUpperCase().replace('.IS', '').trim() : undefined;
    const force = options?.forceRefresh ?? false;

    const now = Date.now();
    if (!force && !symbol && page === 0 && this.kapFeedCache && now - this.kapFeedCache.timestamp < this.CACHE_TTL_MS) {
      return { items: this.kapFeedCache.items, totalElements: this.kapFeedCache.totalElements };
    }
    if (!force && symbol && page === 0) {
      const cached = this.symbolKapCache.get(symbol);
      if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
        return { items: cached.items, totalElements: cached.items.length };
      }
    }

    const params = new URLSearchParams({
      page: String(page),
      size: String(size)
    });
    if (symbol) {
      params.set('symbol', symbol);
    }

    const url = `${this.baseUrl}/kap?${params.toString()}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json'
        }
      });

      this.updateHeadersTelemetry(response.headers);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Bürküt Portföy KAP API Hatası [HTTP ${response.status}]: ${errText.substring(0, 120)}`);
      }

      const json = (await response.json()) as BurkutKapPageResponse;
      const rawContent = json?.data?.content || [];
      const items = rawContent.map(item => this.normalizeKapItem(item));
      const totalElements = json?.data?.totalElements ?? items.length;

      this.lastSuccessAt = new Date().toISOString();
      this.lastError = null;

      if (!symbol && page === 0) {
        this.kapFeedCache = { timestamp: now, items, totalElements };
      } else if (symbol && page === 0) {
        this.symbolKapCache.set(symbol, { timestamp: now, items });
      }

      return { items, totalElements };
    } catch (err: any) {
      this.lastError = err.message || 'Bürküt Portföy API bağlantı hatası';
      throw err;
    }
  }

  /**
   * Fetches all stocks or a single stock from Bürküt Portföy API (/stocks or /stocks/{symbol})
   */
  public async fetchStocks(): Promise<BurkutStockQuote[]> {
    const now = Date.now();
    if (this.stocksCache && now - this.stocksCache.timestamp < this.CACHE_TTL_MS) {
      return this.stocksCache.items;
    }

    const url = `${this.baseUrl}/stocks`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': this.apiKey,
        'Accept': 'application/json'
      }
    });

    this.updateHeadersTelemetry(response.headers);
    if (!response.ok) {
      throw new Error(`Bürküt Portföy /stocks Hatası [HTTP ${response.status}]`);
    }

    const json = await response.json();
    const items: BurkutStockQuote[] = Array.isArray(json?.data) ? json.data : [];
    this.stocksCache = { timestamp: now, items };
    this.lastSuccessAt = new Date().toISOString();
    return items;
  }

  public async fetchStockBySymbol(rawSymbol: string): Promise<BurkutStockQuote | null> {
    const symbol = rawSymbol.toUpperCase().replace('.IS', '').trim();
    const now = Date.now();
    const cached = this.singleStockCache.get(symbol);
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.item;
    }

    const url = `${this.baseUrl}/stocks/${encodeURIComponent(symbol)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': this.apiKey,
        'Accept': 'application/json'
      }
    });

    this.updateHeadersTelemetry(response.headers);
    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    if (json?.data && json.data.symbol) {
      this.singleStockCache.set(symbol, { timestamp: now, item: json.data });
      this.lastSuccessAt = new Date().toISOString();
      return json.data as BurkutStockQuote;
    }
    return null;
  }

  /**
   * Generates ready-to-run developer code snippets (cURL, TypeScript/Fetch, Python)
   * for querying Bürküt Portföy REST API endpoints (/stocks, /stocks/{symbol}, /kap).
   */
  public getCodeSnippets(symbol: string = 'THYAO', page: number = 0, size: number = 20) {
    const cleanSym = symbol.toUpperCase().replace('.IS', '').trim() || 'THYAO';
    const base = this.baseUrl;

    return {
      symbol: cleanSym,
      baseUrl: base,
      endpoints: {
        allStocks: `${base}/stocks`,
        singleStock: `${base}/stocks/${cleanSym}`,
        kapFeed: `${base}/kap?page=${page}&size=${size}`,
        kapBySymbol: `${base}/kap?symbol=${cleanSym}&page=${page}&size=${size}`
      },
      curl: {
        kapFeed: `curl -X GET "${base}/kap?page=${page}&size=${size}" \\\n  -H "X-API-Key: $BURKUT_API_KEY" \\\n  -H "Accept: application/json"`,
        kapBySymbol: `curl -X GET "${base}/kap?symbol=${cleanSym}&page=${page}&size=${size}" \\\n  -H "X-API-Key: $BURKUT_API_KEY" \\\n  -H "Accept: application/json"`,
        singleStock: `curl -X GET "${base}/stocks/${cleanSym}" \\\n  -H "X-API-Key: $BURKUT_API_KEY" \\\n  -H "Accept: application/json"`,
        allStocks: `curl -X GET "${base}/stocks" \\\n  -H "X-API-Key: $BURKUT_API_KEY" \\\n  -H "Accept: application/json"`
      },
      typescript: `const BASE_URL = "${base}";
const API_KEY = process.env.BURKUT_API_KEY!;

// 1. ${cleanSym} Hisse Fiyat ve Hacim Verisi Çekme
export async function getStockQuote(symbol = "${cleanSym}") {
  const res = await fetch(\`\${BASE_URL}/stocks/\${symbol}\`, {
    headers: { "X-API-Key": API_KEY, "Accept": "application/json" }
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const { data } = await res.json();
  return data; // { symbol, name, currentPrice, changePercent, volume, updatedAt }
}

// 2. ${cleanSym} ve Genel KAP Bildirimlerini Çekme
export async function getKapDisclosures(symbol?: string, page = ${page}, size = ${size}) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (symbol) params.set("symbol", symbol);

  const res = await fetch(\`\${BASE_URL}/kap?\${params.toString()}\`, {
    headers: { "X-API-Key": API_KEY, "Accept": "application/json" }
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const { data } = await res.json();
  return data.content; // [{ id, symbol, title, summary, short_description, publishDate }]
}`,
      python: `import os
import requests

BASE_URL = "${base}"
HEADERS = {
    "X-API-Key": os.environ.get("BURKUT_API_KEY", "YOUR_API_KEY"),
    "Accept": "application/json"
}

# 1. ${cleanSym} Tekil Hisse Verisi
stock_resp = requests.get(f"{BASE_URL}/stocks/${cleanSym}", headers=HEADERS, timeout=10)
stock_resp.raise_for_status()
stock_data = stock_resp.json()["data"]
print(f"{stock_data['symbol']}: {stock_data['currentPrice']} TL (%{stock_data['changePercent']})")

# 2. KAP Bildirimleri (${cleanSym} veya Tüm Piyasa)
kap_resp = requests.get(
    f"{BASE_URL}/kap",
    params={"symbol": "${cleanSym}", "page": ${page}, "size": ${size}},
    headers=HEADERS,
    timeout=10
)
kap_resp.raise_for_status()
for item in kap_resp.json()["data"]["content"]:
    print(f"[{item['publishDate']}] {item['symbol']} - {item['title']}: {item['summary']}")`
    };
  }
}
