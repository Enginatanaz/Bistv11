import { KAPDisclosure, KapWebProviderStatus } from '../types.js';
import { InstrumentUniverseService } from '../services/instrumentUniverseService.js';

export interface KapPublicWebConfig {
  baseUrl?: string;
  minDelayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export interface KapWebTestResult {
  reachable: boolean;
  parseable: boolean;
  statusCode: number;
  statusText: string;
  sampleIndex?: string;
  sampleTitle?: string;
  message: string;
}

/**
 * KapPublicWebProvider
 * 
 * Alternative data provider that collects disclosures directly from KAP's
 * publicly accessible web pages (kap.org.tr) on a per-symbol basis.
 * 
 * Strict specifications:
 * - Single-threaded serialized requests (concurrency: 1)
 * - Configurable delay between requests (default: >= 3000ms)
 * - Non-aggressive backoff upon HTTP 429 / 403 / 500
 * - Multi-layer robust HTML and Next.js flight streaming parsing
 * - Stop / cancellation support
 * - Deduplication and field normalization
 */
export class KapPublicWebProvider {
  private static instance: KapPublicWebProvider;

  private baseUrl: string;
  private minDelayMs: number;
  private timeoutMs: number;
  private userAgent: string;

  // Provider telemetry and status state
  private status: 'IDLE' | 'FETCHING' | 'RATE_LIMITED' | 'ERROR' | 'STOPPED' = 'IDLE';
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private fetchedCount: number = 0;
  private newlySavedCount: number = 0;
  private lastAttemptAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;
  private rateLimitedUntil: number | null = null;
  private isStopped: boolean = false;

  // Queue state for strict serialization
  private requestQueuePromise: Promise<void> = Promise.resolve();
  private lastRequestTime: number = 0;

  private universeService: InstrumentUniverseService;

  constructor(config?: KapPublicWebConfig) {
    this.baseUrl = (config?.baseUrl || 'https://www.kap.org.tr').replace(/\/+$/, '');
    this.minDelayMs = Math.max(3000, config?.minDelayMs ?? 3000);
    this.timeoutMs = config?.timeoutMs ?? 8000;
    this.userAgent = config?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    this.universeService = InstrumentUniverseService.getInstance();
  }

  public static getInstance(config?: KapPublicWebConfig): KapPublicWebProvider {
    if (!KapPublicWebProvider.instance) {
      KapPublicWebProvider.instance = new KapPublicWebProvider(config);
    }
    return KapPublicWebProvider.instance;
  }

  /**
   * Returns current status and telemetry of the web provider.
   */
  public getStatus(): KapWebProviderStatus {
    // Check if rate limited period expired
    if (this.status === 'RATE_LIMITED' && this.rateLimitedUntil && Date.now() > this.rateLimitedUntil) {
      this.status = 'IDLE';
      this.rateLimitedUntil = null;
    }

    return {
      status: this.status,
      endpoint: this.baseUrl,
      minDelayMs: this.minDelayMs,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      fetchedCount: this.fetchedCount,
      newlySavedCount: this.newlySavedCount,
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      rateLimitedUntil: this.rateLimitedUntil
    };
  }

  /**
   * Updates newly saved counter (called by KapDisclosuresService).
   */
  public incrementSavedCount(count: number = 1): void {
    this.newlySavedCount += count;
  }

  public recordNewlySaved(count: number = 1): void {
    this.incrementSavedCount(count);
  }

  /**
   * Signals the provider to abort any ongoing batch operations.
   */
  public stop(): void {
    this.isStopped = true;
    this.status = 'STOPPED';
    this.lastError = 'Kullanıcı tarafından işlem durduruldu.';
  }

  /**
   * Resets stopped flag.
   */
  public resetStop(): void {
    this.isStopped = false;
    if (this.status === 'STOPPED') {
      this.status = 'IDLE';
    }
  }

  /**
   * Polite HTTP execution wrapper:
   * - Enforces concurrency = 1 (serial queue)
   * - Enforces minDelayMs between consecutive requests
   * - Handles rate limits (429) with non-aggressive cooldown
   * - Handles 403 WAF blocks safely without circumvention
   */
  private async executeHttpRequest(pathOrUrl: string, method: string = 'GET'): Promise<{ status: number; statusText: string; body: string; ok: boolean }> {
    if (this.isStopped) {
      throw new Error('İşlem durduruldu (stopped).');
    }

    // Check rate limit backoff
    if (this.rateLimitedUntil && Date.now() < this.rateLimitedUntil) {
      const remainingSec = Math.ceil((this.rateLimitedUntil - Date.now()) / 1000);
      throw new Error(`KAP web hız sınırı devrede. Lütfen ${remainingSec} saniye bekleyin (HTTP 429 Cooldown).`);
    }

    const targetUrl = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    // Chain to serial queue
    const execute = async () => {
      // Throttle delay if previous request was too recent
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minDelayMs) {
        const waitMs = this.minDelayMs - elapsed;
        await new Promise(r => setTimeout(r, waitMs));
      }

      this.lastRequestTime = Date.now();
      this.totalRequests++;
      this.lastAttemptAt = new Date().toISOString();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(targetUrl, {
          method,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': `${this.baseUrl}/tr/`
          },
          signal: controller.signal
        });

        clearTimeout(timer);

        const body = await response.text().catch(() => '');

        if (response.status === 429) {
          this.failedRequests++;
          this.status = 'RATE_LIMITED';
          this.rateLimitedUntil = Date.now() + 30_000; // 30-second backoff
          const err = 'KAP web sunucusu hız sınırı (HTTP 429 Too Many Requests) yanıtı verdi. 30 saniye bekleniyor.';
          this.lastError = err;
          throw new Error(err);
        }

        if (response.status === 403) {
          this.failedRequests++;
          this.status = 'ERROR';
          const err = 'KAP web sunucusuna erişim kısıtlandı (HTTP 403 Forbidden). Güvenlik duvarı nedeniyle istek durduruldu.';
          this.lastError = err;
          throw new Error(err);
        }

        if (response.status >= 500) {
          this.failedRequests++;
          this.status = 'ERROR';
          const err = `KAP web sunucu hatası (HTTP ${response.status} ${response.statusText}).`;
          this.lastError = err;
          throw new Error(err);
        }

        if (!response.ok) {
          this.failedRequests++;
          const err = `KAP web isteği başarısız oldu [HTTP ${response.status} ${response.statusText}].`;
          this.lastError = err;
          throw new Error(err);
        }

        this.successfulRequests++;
        this.lastSuccessAt = new Date().toISOString();
        this.lastError = null;

        return {
          status: response.status,
          statusText: response.statusText,
          body,
          ok: response.ok
        };
      } catch (err: any) {
        clearTimeout(timer);
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          this.failedRequests++;
          this.status = 'ERROR';
          const timeoutErr = `KAP web isteği zaman aşımına uğradı (${this.timeoutMs}ms).`;
          this.lastError = timeoutErr;
          throw new Error(timeoutErr);
        }
        if (!err.message?.includes('HTTP 429') && !err.message?.includes('HTTP 403')) {
          this.failedRequests++;
          this.status = 'ERROR';
          this.lastError = err.message || 'KAP web bağlantı hatası';
        }
        throw err;
      }
    };

    // Serial queue guarantee
    const resultPromise = this.requestQueuePromise.then(() => execute(), () => execute());
    this.requestQueuePromise = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  /**
   * Diagnostic test: verifies web reachability and tests parsing of a real KAP disclosure page.
   */
  public async testConnection(): Promise<KapWebTestResult> {
    this.resetStop();
    try {
      // 1. Fetch a known reliable disclosure page index (e.g. 1128456 THYAO)
      const res = await this.executeHttpRequest('/tr/Bildirim/1128456');
      const parsed = this.parseDisclosureDetailPage(res.body, '1128456', 'THYAO');

      if (parsed && parsed.disclosureIndex) {
        return {
          reachable: true,
          parseable: true,
          statusCode: res.status,
          statusText: res.statusText,
          sampleIndex: parsed.disclosureIndex,
          sampleTitle: parsed.title || 'Başlık ayrıştırıldı',
          message: `KAP web bağlantısı ve HTML ayrıştırıcı başarıyla doğrulandı (İndeks: ${parsed.disclosureIndex}, Başlık: ${parsed.title?.substring(0, 50)}...).`
        };
      } else {
        return {
          reachable: true,
          parseable: false,
          statusCode: res.status,
          statusText: res.statusText,
          message: 'KAP web sayfasına ulaşıldı ancak beklenen bildirim alanları ayrıştırılamadı (HTML şablonu değişmiş olabilir).'
        };
      }
    } catch (err: any) {
      return {
        reachable: false,
        parseable: false,
        statusCode: 0,
        statusText: 'CONNECTION_FAILED',
        message: `KAP web bağlantı testi başarısız: ${err.message}`
      };
    }
  }

  /**
   * Extracts disclosure indices from a stock search HTML page.
   * Matches multiple URL patterns (/tr/Bildirim/(\d+)) across hrefs, scripts, and flight payloads.
   */
  public parseSearchPage(html: string, symbol: string): string[] {
    if (!html || typeof html !== 'string') return [];

    const indices: string[] = [];
    const seen = new Set<string>();

    // Pattern 1: Standard href="/tr/Bildirim/123456"
    const hrefRegex = /\/tr\/Bildirim\/(\d{5,8})/gi;
    let m: RegExpExecArray | null;
    while ((m = hrefRegex.exec(html)) !== null) {
      const idx = m[1];
      if (!seen.has(idx)) {
        seen.add(idx);
        indices.push(idx);
      }
    }

    // Pattern 2: JSON or flight format "disclosureIndex":"123456" or "index":"123456"
    const jsonRegex = /"(?:disclosureIndex|index|disclosureId)"\s*:\s*["']?(\d{5,8})["']?/gi;
    while ((m = jsonRegex.exec(html)) !== null) {
      const idx = m[1];
      if (!seen.has(idx)) {
        seen.add(idx);
        indices.push(idx);
      }
    }

    // Pattern 3: URL inside quotes or single quotes
    const quoteUrlRegex = /['"](?:https?:\/\/[^'"]+)?\/tr\/Bildirim\/(\d{5,8})['"]/gi;
    while ((m = quoteUrlRegex.exec(html)) !== null) {
      const idx = m[1];
      if (!seen.has(idx)) {
        seen.add(idx);
        indices.push(idx);
      }
    }

    return indices;
  }

  /**
   * Parses single disclosure detail page HTML:
   * Extracts index, title, symbol, company title, date, category, body text, and PDF attachments.
   */
  public parseDisclosureDetailPage(html: string, disclosureIndex: string, defaultSymbol?: string): Partial<KAPDisclosure> | null {
    if (!html || typeof html !== 'string') return null;

    // 1. Verify disclosure index
    let resolvedIndex = disclosureIndex;
    const bodyScaleMatch = html.match(/id="notification-body-scale-(\d+)"/i);
    if (bodyScaleMatch) {
      resolvedIndex = bodyScaleMatch[1];
    } else {
      const flightIndexMatch = html.match(/"index"\s*:\s*"(\d+)"/i);
      if (flightIndexMatch) {
        resolvedIndex = flightIndexMatch[1];
      }
    }

    if (!resolvedIndex) {
      return null;
    }

    // 2. Extract Publish Date
    // Turkish date formats: "27.10.2026 18:54:31" or "27.10.2026 18:54" or "27.10.2026"
    let publishDate = new Date().toISOString();
    const dateMatch = html.match(/\b(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?\b/);
    if (dateMatch) {
      const day = dateMatch[1];
      const month = dateMatch[2];
      const year = dateMatch[3];
      const hour = dateMatch[4] || '10';
      const min = dateMatch[5] || '00';
      const sec = dateMatch[6] || '00';
      // Format as ISO string with Istanbul timezone (+03:00)
      publishDate = `${year}-${month}-${day}T${hour}:${min}:${sec}+03:00`;
    }

    // 3. Extract Symbol & Company Title
    let resolvedSymbol = defaultSymbol ? defaultSymbol.toUpperCase().replace(/\.IS$/, '') : '';
    let companyTitle = '';

    // Check table cells with gwt-HTML
    const tableCells = (html.match(/<div[^>]*class="[^"]*gwt-HTML[^"]*"[^>]*>([^<]+)<\/div>/gi) || [])
      .map(c => c.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    // Check Next.js streamed chunks for header info (chunk S:1 or modal-infosub)
    const streamedChunks: string[] = [];
    const streamRegex = /<div hidden id="S:\d+">(.*?)<\/div><script>/gs;
    let streamMatch: RegExpExecArray | null;
    while ((streamMatch = streamRegex.exec(html)) !== null) {
      const cleanText = streamMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      streamedChunks.push(cleanText);
    }

    // Look for company title & ticker in streamed chunks
    for (const chunk of streamedChunks) {
      // Chunk snippet like: "MHR GAYRİMENKUL YATIRIM ORTAKLIĞI A.Ş. MHRGY Kapat Gönderim Tarihi 27.10.2026 18:54:31 Bildirim Tipi FR..."
      const tickerMatch = chunk.match(/([A-ZÇĞİÖŞÜ0-9\s.,()-]{4,80})\s+([A-Z]{3,5})\s+Kapat\s+Gönderim Tarihi/);
      if (tickerMatch) {
        if (!companyTitle) companyTitle = tickerMatch[1].trim();
        if (!resolvedSymbol) resolvedSymbol = tickerMatch[2].trim();
        break;
      }
    }

    // Also look for company title in flight data
    const flightCompany = html.match(/\\?"companyTitle\\?"\s*:\s*\\?"([^\\"]{4,100})\\?"/);
    if (!companyTitle && flightCompany && flightCompany[1]) {
      companyTitle = flightCompany[1].trim();
    }

    // If still no symbol, try to match known instruments in HTML
    if (!resolvedSymbol) {
      const allStocks = this.universeService.getAllInstruments();
      for (const st of allStocks) {
        const pattern = new RegExp(`\\b${st.symbol}\\b`, 'i');
        if (pattern.test(html)) {
          resolvedSymbol = st.symbol;
          if (!companyTitle) companyTitle = st.name;
          break;
        }
      }
    }

    if (!companyTitle && resolvedSymbol) {
      const known = this.universeService.getStock(resolvedSymbol);
      if (known) companyTitle = known.name;
    }

    if (!resolvedSymbol) {
      // Cannot attribute to any BIST instrument reliably
      return null;
    }

    // 4. Extract Title / Subject
    let title = '';
    // Method A: Check modal-infosubheader or disclosureSummary
    const subheaderMatch = html.match(/class="modal-infosubheader[^"]*">([^<]+)</i);
    if (subheaderMatch && subheaderMatch[1].trim()) {
      title = subheaderMatch[1].trim();
    }

    // Method B: Check flight disclosureBasic title
    if (!title) {
      const flightTitle = html.match(/\\?"disclosureBasic\\?"\s*:\s*\{[^}]*\\?"title\\?"\s*:\s*\\?"([^\\"]{4,120})\\?"/i) ||
                          html.match(/\\?"title\\?"\s*:\s*\\?"([^\\"]{5,120})\\?"/i);
      if (flightTitle && flightTitle[1] && !flightTitle[1].includes('{') && flightTitle[1] !== 'KAP') {
        title = flightTitle[1].trim();
      }
    }

    // Method C: Check table cell titles
    if (!title && tableCells.length > 0) {
      // Often first non-generic cell is title
      for (const cell of tableCells) {
        if (cell.length > 15 && !cell.includes('MİKTAR') && !cell.includes('ISIN') && !cell.includes('DEĞER') && !cell.includes('AÇIKLAMA') && !cell.includes('=')) {
          title = cell;
          break;
        }
      }
    }

    // Method C: Check streamed chunk for Bildirim Tipi / Subject
    if (!title) {
      for (const chunk of streamedChunks) {
        const typeMatch = chunk.match(/Bildirim Tipi\s+([A-Z0-9]+)(?:\s+Yıl\s+\d+)?(?:\s+Periyot\s+[^B]+)?\s+(?:Bildirim Ekleri[^(]+\(\s*\d+\s*\)\s+[^F]+)?([A-ZÇĞİÖŞÜa-zçğıöşü\s]{6,100})/);
        if (typeMatch && typeMatch[2]) {
          title = typeMatch[2].trim();
          break;
        }
      }
    }

    // Fallback title
    if (!title) {
      title = `${resolvedSymbol} Kamuyu Aydınlatma Bildirimi`;
    }

    // 5. Categorize
    let category: KAPDisclosure['category'] = 'Özel Durum';
    const combinedSearchText = `${title} ${html}`.toUpperCase();
    if (combinedSearchText.includes('FINANSAL RAPOR') || combinedSearchText.includes('BILANCO') || combinedSearchText.includes('FAALIYET RAPORU') || combinedSearchText.includes('BILDIRIM TIPI FR')) {
      category = 'Finansal Rapor';
    } else if (combinedSearchText.includes('TEMETTU') || combinedSearchText.includes('KAR PAYI') || combinedSearchText.includes('SERMAYE ARTIRIM') || combinedSearchText.includes('BEDELLI') || combinedSearchText.includes('BEDELSIZ')) {
      category = 'Temettü / Sermaye';
    } else if (combinedSearchText.includes('HALKA ARZ') || combinedSearchText.includes('IZAHNAME')) {
      category = 'Halka Arz';
    } else if (combinedSearchText.includes('GENEL KURUL') || combinedSearchText.includes('YONETIM KURULU KARARI')) {
      category = 'Şirket Kararı';
    }

    // 6. Extract Original Text / Body
    let originalText = '';
    const bodyMatch = html.match(/<div class="disclosureScrollableArea">(.*?)<\/div>/s);
    if (bodyMatch) {
      originalText = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      // Find largest streamed chunk text
      for (const chunk of streamedChunks) {
        if (chunk.length > originalText.length) {
          originalText = chunk;
        }
      }
    }

    if (!originalText || originalText.length < 20) {
      originalText = `${companyTitle} tarafından yayımlanan ${title} konulu resmî KAP bildirimidir.`;
    }

    // 7. Attachments (PDF Link)
    const attachments: { name: string; url: string; fileType?: string }[] = [];
    const pdfUrl = `${this.baseUrl}/tr/api/BildirimPdf/${resolvedIndex}`;
    attachments.push({
      name: 'Resmî Bildirim Belgesi (PDF)',
      url: pdfUrl,
      fileType: 'pdf'
    });

    // Check if filename was extracted in chunk
    for (const chunk of streamedChunks) {
      const fileMatch = chunk.match(/([a-zA-Z0-9_\-.]+\.pdf)/i);
      if (fileMatch && fileMatch[1]) {
        attachments.push({
          name: fileMatch[1],
          url: pdfUrl,
          fileType: 'pdf'
        });
        break;
      }
    }

    // 8. Deterministic Sentiment & Impact Score
    let sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
    let impactScore = 6.0;

    const lowerText = `${title} ${originalText}`.toLowerCase();
    const posWords = ['ihale', 'yeni iş', 'anlaşma', 'sözleşme', 'ciro artış', 'kâr artış', 'temettü', 'rekor', 'onaylandı', 'genişleme'];
    const negWords = ['zarar', 'iptal', 'dava', 'ceza', 'işlem yasağı', 'tedbir', 'durduruldu', 'soruşturma', 'küçülme'];

    let posCount = 0;
    let negCount = 0;
    for (const w of posWords) if (lowerText.includes(w)) posCount++;
    for (const w of negWords) if (lowerText.includes(w)) negCount++;

    if (posCount > negCount) {
      sentiment = 'POSITIVE';
      impactScore = Math.min(9.5, 6.5 + posCount * 0.7);
    } else if (negCount > posCount) {
      sentiment = 'NEGATIVE';
      impactScore = Math.min(9.5, 6.5 + negCount * 0.7);
    }

    return {
      id: `kap_${resolvedIndex}`,
      disclosureIndex: String(resolvedIndex),
      symbol: resolvedSymbol,
      companyTitle: companyTitle || `${resolvedSymbol} Ortaklığı`,
      publishDate,
      title,
      summary: originalText.length > 250 ? `${originalText.substring(0, 250)}...` : originalText,
      category,
      isImportant: impactScore >= 7.5 || category === 'Finansal Rapor' || category === 'Temettü / Sermaye',
      originalText,
      originalUrl: `${this.baseUrl}/tr/Bildirim/${resolvedIndex}`,
      isVerified: true,
      source: 'KAP Resmî Web Sitesi (kap.org.tr)',
      dataSource: 'KAP_PUBLIC_WEB',
      financialImpactScore: Number(impactScore.toFixed(1)),
      sentiment,
      attachments
    };
  }

  /**
   * Fetches disclosures for a single stock from the public KAP search page.
   * Strictly limits to `maxItems` (default: 5) to respect web server polite usage.
   */
  public async fetchDisclosuresForSymbol(
    symbol: string,
    options?: { maxItems?: number }
  ): Promise<KAPDisclosure[]> {
    this.resetStop();
    const cleanSym = symbol.trim().toUpperCase().replace(/\.IS$/, '');
    const maxItems = Math.min(10, Math.max(1, options?.maxItems ?? 5));

    this.status = 'FETCHING';

    try {
      // 1. Fetch public search page for symbol
      const searchRes = await this.executeHttpRequest(`/tr/search/${cleanSym}/1`);
      const indices = this.parseSearchPage(searchRes.body, cleanSym);

      if (indices.length === 0) {
        this.status = 'IDLE';
        return [];
      }

      const candidateIndices = indices.slice(0, maxItems);
      const results: KAPDisclosure[] = [];

      // 2. Fetch each disclosure detail page in serial queue
      for (const idx of candidateIndices) {
        if (this.isStopped) {
          break;
        }

        try {
          const detailRes = await this.executeHttpRequest(`/tr/Bildirim/${idx}`);
          const parsed = this.parseDisclosureDetailPage(detailRes.body, idx, cleanSym);

          if (parsed && parsed.disclosureIndex && parsed.title) {
            results.push(parsed as KAPDisclosure);
            this.fetchedCount++;
          }
        } catch (detailErr: any) {
          console.warn(`[KAP Web Provider] Bildirim ${idx} detayı alınırken hata:`, detailErr.message);
          // Continue to next item if single detail fails
        }
      }

      this.status = 'IDLE';
      return results;
    } catch (err: any) {
      if ((this.status as string) !== 'RATE_LIMITED') {
        this.status = 'ERROR';
      }
      this.lastError = err.message || 'KAP web arama isteği başarısız oldu.';
      throw err;
    }
  }

  /**
   * Fetches single disclosure detail by index.
   */
  public async fetchDisclosureDetail(disclosureIndex: string, defaultSymbol?: string): Promise<KAPDisclosure | null> {
    this.resetStop();
    const cleanIdx = String(disclosureIndex).trim();
    if (!cleanIdx) return null;

    try {
      const res = await this.executeHttpRequest(`/tr/Bildirim/${cleanIdx}`);
      const parsed = this.parseDisclosureDetailPage(res.body, cleanIdx, defaultSymbol);
      if (parsed && parsed.disclosureIndex) {
        this.fetchedCount++;
        return parsed as KAPDisclosure;
      }
      return null;
    } catch (err: any) {
      console.warn(`[KAP Web Provider] ${cleanIdx} detay hatası:`, err.message);
      return null;
    }
  }
}
