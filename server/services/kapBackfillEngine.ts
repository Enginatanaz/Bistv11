import fs from 'fs';
import path from 'path';
import { KAPBackfillStatus } from '../types.js';
import { BurkutApiClient } from './burkutApiClient.js';
import { KapDisclosuresService } from './kapDisclosuresService.js';
import { InstrumentUniverseService } from './instrumentUniverseService.js';

/**
 * KapBackfillEngine
 *
 * Synchronizes the verified latest 5 KAP disclosures per BIST stock
 * using exclusively Burkut Portföy REST API (/api/public/v1/kap) and official KAP (kap.org.tr).
 * Zero MKK API references or dependencies.
 */
export class KapBackfillEngine {
  private static instance: KapBackfillEngine;

  private burkutClient: BurkutApiClient;
  private kapService: KapDisclosuresService;
  private universeService: InstrumentUniverseService;

  private stateFilePath: string;
  private activeTimer: NodeJS.Timeout | null = null;
  private isTickInProgress = false;
  private touchedStocks: Set<string> = new Set();

  private state: KAPBackfillStatus = {
    status: 'IDLE',
    mode: 'FORWARD_CATCHUP',
    startIndex: 0,
    targetIndex: 10,
    currentCursor: 0,
    lastSuccessfulIndex: null,
    processedBatchesCount: 0,
    pendingBatchesCount: 0,
    failedBatchesCount: 0,
    failedBatchIndices: [],
    totalDisclosuresFetched: 0,
    newDisclosuresSaved: 0,
    duplicateDisclosuresSkipped: 0,
    unmatchedDisclosuresCount: 0,
    processedStocksCount: 0,
    stocksWithDisclosuresCount: 0,
    pendingStocksCount: 529,
    totalApiCallsCount: 0,
    lastApiCallTimestamp: null,
    lastSuccessfulApiCallTimestamp: null,
    lastError: null,
    retryCount: 0,
    estimatedTotalApiCalls: 10,
    estimatedApiNotice:
      'Bürküt Portföy REST API (/api/public/v1/kap) üzerinden her hisse için yalnızca doğrulanmış son 5 KAP bildirimi senkronize edilir.',
    startedAt: null,
    completedAt: null,
    dataSource: 'BURKUT_KAP_API',
    completionMessage: null,
    canResume: false,
    canPause: false,
    canStop: false
  };

  constructor() {
    this.burkutClient = BurkutApiClient.getInstance();
    this.kapService = KapDisclosuresService.getInstance();
    this.universeService = InstrumentUniverseService.getInstance();

    this.stateFilePath = path.resolve(process.cwd(), 'server/data/kap_backfill_state.json');
    this.initStorageAndLoadState();
  }

  public static getInstance(): KapBackfillEngine {
    if (!KapBackfillEngine.instance) {
      KapBackfillEngine.instance = new KapBackfillEngine();
    }
    return KapBackfillEngine.instance;
  }

  private initStorageAndLoadState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = {
            ...this.state,
            ...parsed,
            dataSource: 'BURKUT_KAP_API'
          };

          if (this.state.status === 'RUNNING') {
            this.state.status = 'PAUSED';
            this.state.canResume = true;
            this.state.canPause = false;
            this.state.canStop = true;
            this.state.lastError =
              'Sunucu yeniden başlatıldığı için işlem güvenli şekilde duraklatıldı. Kaldığı yerden devam edebilirsiniz.';
            this.saveState();
          }
        }
      }
    } catch (err: any) {
      console.warn('[KAP Sync Engine] Durum yükleme uyarısı:', err.message);
    }
  }

  public saveState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[KAP Sync Engine] Durum kaydedilemedi:', err.message);
    }
  }

  public getStatus(): KAPBackfillStatus {
    const totalEquities = this.universeService.getAllInstruments().length || 529;
    let pendingBatches = 0;
    if (this.state.targetIndex >= this.state.currentCursor) {
      pendingBatches = Math.max(
        0,
        Math.ceil((this.state.targetIndex - this.state.currentCursor + 1) / 50)
      );
    }
    this.state.pendingBatchesCount = pendingBatches;
    this.state.stocksWithDisclosuresCount = Math.max(
      this.state.stocksWithDisclosuresCount,
      this.kapService.getCoveredSymbolsCount()
    );
    this.state.pendingStocksCount = Math.max(0, totalEquities - this.state.stocksWithDisclosuresCount);
    return { ...this.state };
  }

  public async start(options?: {
    fromIndex?: number;
    toIndex?: number;
    mode?: 'FORWARD_CATCHUP' | 'HISTORICAL_DEEP_SCAN';
  }): Promise<KAPBackfillStatus> {
    if (this.state.status === 'RUNNING') {
      return this.getStatus();
    }

    const start = options?.fromIndex !== undefined ? Number(options.fromIndex) : 0;
    const target = options?.toIndex !== undefined ? Number(options.toIndex) : start + 250;
    const totalBatches = Math.max(1, Math.ceil((target - start + 1) / 50));

    this.state.status = 'RUNNING';
    this.state.mode = options?.mode || 'FORWARD_CATCHUP';
    this.state.startIndex = start;
    this.state.targetIndex = target;
    this.state.currentCursor = start;
    this.state.pendingBatchesCount = totalBatches;
    this.state.estimatedTotalApiCalls = totalBatches;
    this.state.startedAt = new Date().toISOString();
    this.state.completedAt = null;
    this.state.completionMessage = null;
    this.state.lastError = null;
    this.state.dataSource = 'BURKUT_KAP_API';
    this.state.canResume = false;
    this.state.canPause = true;
    this.state.canStop = true;

    this.saveState();
    this.scheduleNextTick(200);
    return this.getStatus();
  }

  public pause(): KAPBackfillStatus {
    if (this.state.status === 'RUNNING') {
      this.state.status = 'PAUSED';
      this.state.canResume = true;
      this.state.canPause = false;
      this.state.canStop = true;
      if (this.activeTimer) {
        clearTimeout(this.activeTimer);
        this.activeTimer = null;
      }
      this.saveState();
    }
    return this.getStatus();
  }

  public resume(): KAPBackfillStatus {
    if (
      this.state.status === 'PAUSED' ||
      this.state.status === 'STOPPED' ||
      this.state.status === 'ERROR'
    ) {
      this.state.status = 'RUNNING';
      this.state.canResume = false;
      this.state.canPause = true;
      this.state.canStop = true;
      this.state.lastError = null;
      this.saveState();
      this.scheduleNextTick(300);
    }
    return this.getStatus();
  }

  public stop(): KAPBackfillStatus {
    this.state.status = 'STOPPED';
    this.state.canResume = true;
    this.state.canPause = false;
    this.state.canStop = false;
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.saveState();
    return this.getStatus();
  }

  private scheduleNextTick(delayMs = 6000): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.state.status !== 'RUNNING') return;

    this.activeTimer = setTimeout(() => {
      this.processTick().catch(err => {
        console.error('[KAP Sync Engine] Tick hatası:', err);
      });
    }, delayMs);
  }

  private async processTick(): Promise<void> {
    if (this.state.status !== 'RUNNING' || this.isTickInProgress) {
      return;
    }

    this.isTickInProgress = true;
    try {
      const pageToQuery = this.state.processedBatchesCount;
      this.state.totalApiCallsCount++;
      this.state.lastApiCallTimestamp = new Date().toISOString();

      const res = await this.burkutClient.fetchKapDisclosures({
        page: pageToQuery,
        size: 50,
        forceRefresh: true
      });

      this.state.totalDisclosuresFetched += res.items.length;

      for (const item of res.items) {
        const added = this.kapService.addLiveDisclosure(item);
        if (added) {
          this.state.newDisclosuresSaved++;
          this.touchedStocks.add(item.symbol);
        } else {
          this.state.duplicateDisclosuresSkipped++;
        }
      }

      this.state.processedBatchesCount++;
      this.state.lastSuccessfulIndex = this.state.currentCursor + res.items.length;
      this.state.currentCursor = this.state.lastSuccessfulIndex;
      this.state.lastSuccessfulApiCallTimestamp = new Date().toISOString();
      this.state.lastError = null;
      this.state.processedStocksCount = this.kapService.getCoveredSymbolsCount();
      this.state.stocksWithDisclosuresCount = this.kapService.getCoveredSymbolsCount();

      if (res.items.length < 50 || this.state.currentCursor >= this.state.targetIndex) {
        this.completeBackfill();
        return;
      }

      this.saveState();
      this.scheduleNextTick(6000);
    } catch (err: any) {
      this.state.lastError = err.message || 'Bürküt Portföy KAP API senkronizasyon hatası';
      this.state.failedBatchesCount++;
      this.state.retryCount++;
      this.saveState();
      this.scheduleNextTick(10000);
    } finally {
      this.isTickInProgress = false;
    }
  }

  private completeBackfill(): void {
    this.state.status = 'COMPLETED';
    this.state.completedAt = new Date().toISOString();
    this.state.pendingBatchesCount = 0;
    this.state.canPause = false;
    this.state.canResume = false;
    this.state.canStop = false;
    this.state.dataSource = 'BURKUT_KAP_API';
    this.state.completionMessage =
      'Bürküt Portföy REST API ve resmi KAP (kap.org.tr) üzerinden hisse bazlı son 5 bildirim senkronizasyonu başarıyla tamamlandı.';

    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }

    this.saveState();
    this.kapService.invalidateAuditCache();
  }
}
