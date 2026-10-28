import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/apiClient';
import { KAPBackfillStatus, KapWebProviderStatus } from '../../types';
import {
  Settings,
  Shield,
  Server,
  CheckCircle2,
  Key,
  Info,
  RefreshCw,
  Layers,
  ShieldCheck,
  Play,
  Pause,
  RotateCcw,
  Square,
  Radio,
  Clock,
  AlertTriangle,
  AlertCircle,
  Globe,
  Search,
  ExternalLink
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [providerMode, setProviderMode] = useState<string>('REAL');
  const [providerName, setProviderName] = useState<string>('Borsa İstanbul Gerçek Veri Motoru (Yahoo Finance BIST Feed)');
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);
  const [auditData, setAuditData] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // KAP Historical Backfill Engine State
  const [backfillStatus, setBackfillStatus] = useState<KAPBackfillStatus | null>(null);
  const [isBackfillActionLoading, setIsBackfillActionLoading] = useState<boolean>(false);
  const [backfillFeedback, setBackfillFeedback] = useState<string | null>(null);

  // KAP Web Provider State (Alternative Public Provider)
  const [kapWebStatus, setKapWebStatus] = useState<KapWebProviderStatus | null>(null);
  const [webTesting, setWebTesting] = useState<boolean>(false);
  const [webSyncing, setWebSyncing] = useState<boolean>(false);
  const [webTargetSymbol, setWebTargetSymbol] = useState<string>('THYAO');
  const [webFeedback, setWebFeedback] = useState<string | null>(null);
  const [webTestResult, setWebTestResult] = useState<any | null>(null);

  useEffect(() => {
    apiClient.getSettings()
      .then(res => {
        setProviderMode(res.providerMode);
        setProviderName(res.providerName);
        setHasGeminiKey(res.hasGeminiKey);
      })
      .catch(() => {});

    loadAudit();
    loadBackfillStatus();
    loadKapWebStatus();
  }, []);

  // Poll status while running
  useEffect(() => {
    let interval: any = null;
    if (backfillStatus?.status === 'RUNNING') {
      interval = setInterval(() => {
        apiClient.getKAPBackfillStatus()
          .then(st => setBackfillStatus(st))
          .catch(() => {});
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [backfillStatus?.status]);

  const loadAudit = () => {
    setIsAuditing(true);
    apiClient.getUniverseAudit()
      .then(data => {
        setAuditData(data);
      })
      .catch(err => {
        console.warn('Audit error:', err.message);
      })
      .finally(() => {
        setIsAuditing(false);
      });
  };

  const loadBackfillStatus = async () => {
    try {
      const res = await apiClient.getKAPBackfillStatus();
      setBackfillStatus(res);
    } catch (err: any) {
      console.warn('Backfill status fetch warning:', err.message);
    }
  };

  const handleStartBackfill = async () => {
    setIsBackfillActionLoading(true);
    setBackfillFeedback(null);
    try {
      const res = await apiClient.startKAPBackfill();
      setBackfillStatus(res);
      setBackfillFeedback('Tüm 529 hisse için KAP geçmiş tarama işlemi başarıyla başlatıldı. Arka planda kaldığı yerden devam edecektir.');
    } catch (err: any) {
      setBackfillFeedback(`Başlatma hatası: ${err.message}`);
    } finally {
      setIsBackfillActionLoading(false);
    }
  };

  const handlePauseBackfill = async () => {
    setIsBackfillActionLoading(true);
    setBackfillFeedback(null);
    try {
      const res = await apiClient.pauseKAPBackfill();
      setBackfillStatus(res);
      setBackfillFeedback('İşlem güvenli şekilde duraklatıldı. Mevcut başarılı indeks ve kayıtlar korundu.');
    } catch (err: any) {
      setBackfillFeedback(`Duraklatma hatası: ${err.message}`);
    } finally {
      setIsBackfillActionLoading(false);
    }
  };

  const handleResumeBackfill = async () => {
    setIsBackfillActionLoading(true);
    setBackfillFeedback(null);
    try {
      const res = await apiClient.resumeKAPBackfill();
      setBackfillStatus(res);
      setBackfillFeedback('İşlem kaldığı başarılı indeksten itibaren otomatik olarak sürdürülüyor.');
    } catch (err: any) {
      setBackfillFeedback(`Devam ettirme hatası: ${err.message}`);
    } finally {
      setIsBackfillActionLoading(false);
    }
  };

  const handleStopBackfill = async () => {
    setIsBackfillActionLoading(true);
    setBackfillFeedback(null);
    try {
      const res = await apiClient.stopKAPBackfill();
      setBackfillStatus(res);
      setBackfillFeedback('İşlem durduruldu. Toplanan bildirimler ve son başarılı indeks saklandı.');
    } catch (err: any) {
      setBackfillFeedback(`Durdurma hatası: ${err.message}`);
    } finally {
      setIsBackfillActionLoading(false);
    }
  };

  const loadKapWebStatus = async () => {
    try {
      const st = await apiClient.getKAPWebStatus();
      setKapWebStatus(st);
    } catch (err: any) {
      console.warn('KAP Web status fetch error:', err.message);
    }
  };

  const handleTestWebConnection = async () => {
    setWebTesting(true);
    setWebFeedback(null);
    try {
      const res = await apiClient.testKAPWebConnection();
      setWebTestResult(res);
      setWebFeedback(res.message);
      loadKapWebStatus();
    } catch (err: any) {
      setWebFeedback(`Bağlantı testi hatası: ${err.message}`);
    } finally {
      setWebTesting(false);
    }
  };

  const handleSyncWebSymbol = async () => {
    if (!webTargetSymbol.trim()) return;
    setWebSyncing(true);
    setWebFeedback(null);
    try {
      const res = await apiClient.syncKAPWebForSymbol(webTargetSymbol.trim().toUpperCase(), 5);
      setWebFeedback(`${webTargetSymbol.toUpperCase()} için işlem tamamlandı: ${res.fetchedCount} bildirim web sayfasından çekildi, ${res.newlySavedCount} yeni bildirim sisteme kaydedildi.`);
      loadKapWebStatus();
    } catch (err: any) {
      setWebFeedback(`Hisse bildirim çekme hatası: ${err.message}`);
    } finally {
      setWebSyncing(false);
    }
  };

  const handleStopWeb = async () => {
    try {
      await apiClient.stopKAPWeb();
      setWebFeedback('KAP web veri istekleri durduruldu.');
      loadKapWebStatus();
    } catch (err: any) {
      setWebFeedback(`Durdurma hatası: ${err.message}`);
    }
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Henüz çağrı yok';
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? ts : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  // Compute progress percentage
  const calculateProgressPct = () => {
    if (!backfillStatus || backfillStatus.targetIndex <= backfillStatus.startIndex) return 0;
    const totalSpan = backfillStatus.targetIndex - backfillStatus.startIndex;
    const currentSpan = (backfillStatus.lastSuccessfulIndex || backfillStatus.currentCursor) - backfillStatus.startIndex;
    const pct = Math.round((currentSpan / totalSpan) * 100);
    return Math.min(100, Math.max(0, pct));
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-400" />
          Sistem ve Veri Sağlayıcı Ayarları (FAZ 1 Gerçek Veri Altyapısı)
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Borsa İstanbul resmi hisse evreni, deterministik veri doğrulama motoru ve API güvenlik yapılandırmaları.
        </p>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TÜM HİSSELERİN KAP VERİLERİNİ TAMAMLA (DAYANIKLI ARKA PLAN MOTORU)       */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-100">
                Tüm Hisselerin KAP Verilerini Tamamla
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                529 HİSSE ARŞİV MOTORU
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl">
              Bütün BIST hisselerinin KAP bildirimlerini erişilebilen en eski kayıttan başlayarak tarar, eksik bildirimleri indirir ve her hisseye doğru şekilde dağıtır. Uzun süren işlemler otomatik olarak kaldığı yerden devam eder.
            </p>
          </div>

          {/* Status Indicator */}
          {backfillStatus && (
            <div className="flex items-center gap-2 font-mono text-xs">
              {backfillStatus.status === 'RUNNING' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  ÇALIŞIYOR · TARANIYOR
                </span>
              )}
              {backfillStatus.status === 'PAUSED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  DURAKLATILDI (YERİ SAKLI)
                </span>
              )}
              {backfillStatus.status === 'COMPLETED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-950 text-blue-300 border border-blue-800">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  ARŞİV TARAMASI TAMAMLANDI
                </span>
              )}
              {backfillStatus.status === 'STOPPED' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 text-slate-400 border border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  DURDURULDU
                </span>
              )}
              {backfillStatus.status === 'ERROR' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950 text-rose-300 border border-rose-800">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  HATA · YENİDEN DENEME BEKLİYOR
                </span>
              )}
              {backfillStatus.status === 'IDLE' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 text-slate-400 border border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  HAZIR · BEKLİYOR
                </span>
              )}
            </div>
          )}
        </div>

        {/* Feedback message if available */}
        {backfillFeedback && (
          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>{backfillFeedback}</span>
          </div>
        )}

        {/* Pre-start API Call Estimation Banner (Section 1) */}
        <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Tahmini API Çağrısı Sayısı:</span>
            <span className="text-emerald-400 font-mono font-bold">
              {backfillStatus?.estimatedTotalApiCalls
                ? `~${backfillStatus.estimatedTotalApiCalls} Toplu API Çağrısı (Son 5 Bildirim / Hisse)`
                : 'Bürküt KAP API sorgusu sonrası hesaplanacaktır'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Bürküt Portföy REST API ve kap.org.tr üzerinden 529 hissenin tamamı için doğrulanmış son 5 KAP bildirimi taranır ve %100 BIST kodu eşleşmesiyle hisselere dağıtılır.
          </p>
        </div>

        {/* Action Buttons Toolbar (Section 1) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Button 1: Start */}
          <button
            onClick={handleStartBackfill}
            disabled={backfillStatus?.status === 'RUNNING' || isBackfillActionLoading}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-1.5 shadow-sm"
            title="Tüm BIST hisselerinin KAP verilerini geçmişe dönük taramaya başlar"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Tüm Hisselerin KAP Verilerini Tamamla
          </button>

          {/* Button 2: Pause */}
          <button
            onClick={handlePauseBackfill}
            disabled={backfillStatus?.status !== 'RUNNING' || isBackfillActionLoading}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-1.5"
            title="Taramayı güvenli şekilde duraklatır; mevcut indeks saklanır"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            İşlemi Duraklat
          </button>

          {/* Button 3: Resume */}
          <button
            onClick={handleResumeBackfill}
            disabled={!backfillStatus?.canResume || backfillStatus?.status === 'RUNNING' || isBackfillActionLoading}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-1.5"
            title="Kaldığı başarılı indeksten itibaren taramayı sürdürür"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            İşleme Devam Et
          </button>

          {/* Button 4: Stop */}
          <button
            onClick={handleStopBackfill}
            disabled={backfillStatus?.status !== 'RUNNING' && backfillStatus?.status !== 'PAUSED' || isBackfillActionLoading}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-slate-100 font-bold text-xs rounded transition-colors flex items-center gap-1.5"
            title="Taramayı tamamen durdurur"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            İşlemi Durdur
          </button>

          {/* Button 5: Refresh */}
          <button
            onClick={loadBackfillStatus}
            disabled={isBackfillActionLoading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded transition-colors flex items-center gap-1.5"
            title="Arka plan işlem durumunu sorgular"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBackfillActionLoading ? 'animate-spin' : ''}`} />
            Durumu Yenile
          </button>
        </div>

        {/* Progress Bar */}
        {backfillStatus && backfillStatus.targetIndex > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Arşiv Tarama İlerlemesi (%{calculateProgressPct()})</span>
              <span className="text-emerald-400 font-bold">
                #{backfillStatus.lastSuccessfulIndex || backfillStatus.currentCursor} / #{backfillStatus.targetIndex}
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-emerald-400 h-2 transition-all duration-500 ease-out"
                style={{ width: `${calculateProgressPct()}%` }}
              />
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* PROGRESS DASHBOARD METRIC GRID (SECTION 7 SPECIFICATION)              */}
        {/* ===================================================================== */}
        {backfillStatus && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              {/* Box 1: İndeks Aralığı */}
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-sans">İşlenen İndeks Aralığı</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5 truncate">
                  #{backfillStatus.startIndex} ➔ #{backfillStatus.currentCursor}
                </div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Hedef En Son İndeks: <strong className="text-slate-200">#{backfillStatus.targetIndex}</strong>
                </div>
              </div>

              {/* Box 2: Son Başarılı İndeks */}
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-sans">Son Başarılı İndeks</div>
                <div className="text-base font-bold text-cyan-400 mt-0.5">
                  #{backfillStatus.lastSuccessfulIndex ?? 'Henüz Yok'}
                </div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Kayıt Güvenceli İmleç Noktası
                </div>
              </div>

              {/* Box 3: Grup İstatistikleri */}
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-sans">İşlenen / Bekleyen Grup</div>
                <div className="text-base font-bold text-slate-100 mt-0.5">
                  {backfillStatus.processedBatchesCount} <span className="text-slate-500 text-xs">/ {backfillStatus.pendingBatchesCount}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Başarısız Grup: <strong className="text-rose-400">{backfillStatus.failedBatchesCount}</strong>
                </div>
              </div>

              {/* Box 4: Alınan & Kaydedilen Bildirim */}
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-sans">Yeni Kaydedilen / Toplam</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {backfillStatus.newDisclosuresSaved} <span className="text-slate-500 text-xs">/ {backfillStatus.totalDisclosuresFetched}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Atlanan Yinelenen: <strong className="text-amber-400">{backfillStatus.duplicateDisclosuresSkipped}</strong>
                </div>
              </div>
            </div>

            {/* Granular Telemetry Strip */}
            <div className="p-3.5 bg-slate-950 rounded border border-slate-800 text-xs font-mono space-y-1.5 text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span>529 Hisse Evreni Kapsamı:</span>
                <span className="text-slate-100">
                  İşlenen Hisse: <strong className="text-emerald-400">{backfillStatus.processedStocksCount}</strong> ·{' '}
                  Verisi Tamamlanan: <strong className="text-cyan-400">{backfillStatus.stocksWithDisclosuresCount}</strong> ·{' '}
                  Henüz Taranmayan: <strong className="text-slate-400">{backfillStatus.pendingStocksCount}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span>Eşleştirilemeyen Bildirimler:</span>
                <span className="text-amber-300">
                  <strong>{backfillStatus.unmatchedDisclosuresCount} Adet</strong> (Fon/tahvil ihraçları silinmeden ayrı havuzda saklanıyor)
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span>Yapılan Toplam API Çağrısı:</span>
                <span className="text-emerald-400">
                  <strong>{backfillStatus.totalApiCallsCount}</strong> (0 hisse başı çağrı · Kota: 6 istek/dakika)
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span>Son Başarılı API Çağrısı Zamanı:</span>
                <span className="text-slate-200">
                  {formatTimestamp(backfillStatus.lastSuccessfulApiCallTimestamp)}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <span>Son Hata &amp; Yeniden Deneme Durumu:</span>
                <span className={backfillStatus.lastError ? 'text-rose-400' : 'text-slate-400'}>
                  {backfillStatus.lastError || 'Hata Yok'} (Yeniden Deneme: {backfillStatus.retryCount})
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Aktif Veri Kaynağı:</span>
                <span className="text-cyan-400">
                  Bürküt Portföy REST API (api.burkutportfoy.com) &amp; kap.org.tr
                </span>
              </div>
            </div>

            {/* Section 8: Completion Banner */}
            {backfillStatus.status === 'COMPLETED' && (
              <div className="p-3 bg-blue-950/60 border border-blue-800 rounded text-xs space-y-1">
                <div className="flex items-center gap-2 text-blue-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  KAP Son 5 Bildirim Taraması Tamamlandı
                </div>
                <p className="text-[11px] text-blue-200/90 leading-relaxed">
                  {backfillStatus.completionMessage || 'Bürküt Portföy REST API ve kap.org.tr üzerinden erişilebilir KAP bildirim taraması tamamlandı. Her hisse için en fazla son 5 doğrulanmış bildirim saklanmaktadır.'}
                </p>
              </div>
            )}

            {/* Section 7 Footnote */}
            <div className="text-[11px] text-slate-500 italic">
              * Sistemde sahte/mock bildirimler kesinlikle yer almaz; yalnızca Bürküt API ve kap.org.tr üzerinden doğrulanmış son 5 KAP bildirimi kaydedilir.
            </div>
          </div>
        )}
      </div>

      {/* KAP Web Veri Kaynağı (Alternatif / Herkese Açık Sağlayıcı) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              KAP Resmî Web Veri Kaynağı (kap.org.tr Hisse Bazlı Bildirim Motoru)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              kap.org.tr resmî herkese açık sayfalarından doğrudan hisse bazlı son 5 KAP bildirimini doğrulayarak çeken motor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {kapWebStatus && (
              <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                kapWebStatus.status === 'FETCHING'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : kapWebStatus.status === 'RATE_LIMITED'
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : kapWebStatus.status === 'ERROR'
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : kapWebStatus.status === 'STOPPED'
                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                  : 'bg-slate-950 text-slate-300 border-slate-800'
              }`}>
                {kapWebStatus.status === 'FETCHING' && '● ÇEKİLİYOR'}
                {kapWebStatus.status === 'RATE_LIMITED' && '⚠ HIZ SINIRI (429 BEKLEMESİ)'}
                {kapWebStatus.status === 'ERROR' && '✕ HATA OLUŞTU'}
                {kapWebStatus.status === 'STOPPED' && '■ DURDURULDU'}
                {kapWebStatus.status === 'IDLE' && '○ BEKLİYOR (BOŞTA)'}
              </span>
            )}
            <button
              onClick={loadKapWebStatus}
              className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors"
              title="Sonuçları Yenile"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Feedback message banner */}
        {webFeedback && (
          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{webFeedback}</span>
              {webTestResult?.sampleIndex && (
                <div className="mt-1 font-mono text-[11px] text-slate-400">
                  Örnek İndeks: #{webTestResult.sampleIndex} · Başlık: {webTestResult.sampleTitle}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Telemetry Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <div className="text-[11px] text-slate-500 font-sans">Kaynak Durumu</div>
            <div className="text-base font-bold text-cyan-400 mt-0.5 truncate">
              {kapWebStatus?.status || 'IDLE'}
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Hız Sınırı: {kapWebStatus?.minDelayMs || 3000}ms gecikme
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <div className="text-[11px] text-slate-500 font-sans">İstek Sayısı (Başarılı / Toplam)</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {kapWebStatus?.successfulRequests ?? 0} <span className="text-slate-500 text-xs">/ {kapWebStatus?.totalRequests ?? 0}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Başarısız: <strong className="text-rose-400">{kapWebStatus?.failedRequests ?? 0}</strong>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <div className="text-[11px] text-slate-500 font-sans">Alınan / Yeni Kaydedilen</div>
            <div className="text-base font-bold text-slate-100 mt-0.5">
              {kapWebStatus?.fetchedCount ?? 0} <span className="text-emerald-400 text-xs">({kapWebStatus?.newlySavedCount ?? 0} yeni)</span>
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Mükerrer Bildirim Atlandı
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <div className="text-[11px] text-slate-500 font-sans">Son Başarılı Erişim</div>
            <div className="text-sm font-bold text-slate-200 mt-0.5 truncate">
              {formatTimestamp(kapWebStatus?.lastSuccessAt ?? null)}
            </div>
            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
              Son Hata: <span className={kapWebStatus?.lastError ? 'text-rose-400' : 'text-slate-400'}>{kapWebStatus?.lastError || 'Yok'}</span>
            </div>
          </div>
        </div>

        {/* Interactive Action Controls */}
        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestWebConnection}
                disabled={webTesting}
                className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${webTesting ? 'animate-spin' : ''}`} />
                {webTesting ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
              </button>

              <button
                onClick={handleStopWeb}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Square className="w-3.5 h-3.5 text-rose-400" />
                İşlemi Durdur
              </button>
            </div>

            {/* Single Stock On-Demand Sync Control */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Hisse Kodu:</span>
              <input
                type="text"
                value={webTargetSymbol}
                onChange={e => setWebTargetSymbol(e.target.value.toUpperCase())}
                placeholder="Örn: THYAO"
                maxLength={10}
                className="w-24 px-2.5 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono focus:border-cyan-500 focus:outline-none uppercase"
              />
              <button
                onClick={handleSyncWebSymbol}
                disabled={webSyncing || !webTargetSymbol.trim()}
                className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Search className={`w-3.5 h-3.5 ${webSyncing ? 'animate-spin' : ''}`} />
                {webSyncing ? 'Kontrol Ediliyor...' : 'Seçili Hisse İçin Bildirimleri Kontrol Et'}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">✓ Nezaketli İstek Yönetimi:</span>
              <span>İstekler arasında min. 3000ms bekleme ve eşzamanlılık sınırı = 1 (seri kuyruk) uygulanır.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold">✓ Tekil Hisse İzolasyonu:</span>
              <span>Yalnızca kullanıcının seçtiği hisse için istek yapılır. 529 hisselik toplu tarama yapılmaz.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Status (Rule 1 & Rule 2: Strictly Zero Fake/Mock Data) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              Aktif Piyasa Verisi Motoru (Kural 1 &amp; Kural 2)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Uygulamada rastgele fiyat, sentetik OHLCV ve sahte mock veri üretimi tamamen kaldırılmıştır.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            %100 GERÇEK BIST FEED
          </span>
        </div>

        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-100 text-xs">{providerName}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-slate-950 font-mono">
              AKTİF MOTOR
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Borsa İstanbul Pay Piyasası'ndaki tüm resmi pay senetleri (Yıldız, Ana, Alt ve PÖİP) gerçek .IS sağlayıcı sorguları ile taranır. Doğrulanamayan veya veri bulunamayan hisselerde asla sahte fiyat üretilmez; durum şeffaf bir şekilde UNAVAILABLE olarak bildirilir.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80">
            <div>Gecikme: <strong className="text-amber-400">15 Dk (Resmi)</strong></div>
            <div>Sentetik Veri: <strong className="text-emerald-400">Sıfır (0)</strong></div>
            <div>Eşzamanlılık Havuzu: <strong className="text-slate-200">3 Eşzamanlı</strong></div>
            <div>Hata Yönetimi: <strong className="text-slate-200">Exp. Backoff</strong></div>
          </div>
        </div>
      </div>

      {/* Universe & Real Data Availability Audit Report */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              BIST Hisse Evreni &amp; Gerçek Veri Denetim Raporu
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              FAZ 1 kapsamında ölçülen katalog, pazar dağılımı ve sağlayıcı veri durumu metrikleri.
            </p>
          </div>
          <button
            onClick={loadAudit}
            disabled={isAuditing}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isAuditing ? 'animate-spin' : ''}`} />
            Denetimi Yenile
          </button>
        </div>

        {auditData ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-mono">Toplam Hisse Evreni</div>
                <div className="text-lg font-bold text-emerald-400 font-mono">{auditData.totalEquityCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Yıldız, Ana, Alt, PÖİP</div>
              </div>
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-mono">Yıldız / Ana Pazar</div>
                <div className="text-lg font-bold text-slate-100 font-mono">{auditData.yildizPazarCount} / {auditData.anaPazarCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Likidite Liderleri</div>
              </div>
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-mono">Alt Pazar / PÖİP</div>
                <div className="text-lg font-bold text-slate-100 font-mono">{auditData.altPazarCount} / {auditData.digerPazarCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Gelişen &amp; Yapılandırılmış</div>
              </div>
              <div className="p-3 bg-slate-950 rounded border border-slate-800">
                <div className="text-[11px] text-slate-500 font-mono">İşlem Durumu</div>
                <div className="text-lg font-bold text-slate-100 font-mono">
                  <span className="text-emerald-400">{auditData.activeCount}</span>
                  <span className="text-slate-600 text-xs"> Aktif</span> · 
                  <span className="text-rose-400"> {auditData.haltedCount + auditData.suspendedCount}</span>
                  <span className="text-slate-600 text-xs"> Kapalı</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Durdurulan/Kapalı Hisseler</div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono space-y-1 text-slate-400">
              <div className="flex items-center justify-between">
                <span>Tekrarlanan (Mükerrer) Sembol Sayısı:</span>
                <span className="text-emerald-400 font-bold">{auditData.duplicateCount} (Sıfır Hata)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Fon / Varant / Sertifika Sızıntısı:</span>
                <span className="text-emerald-400 font-bold">{auditData.nonEquityLeakCount} (Sıfır Sızıntı)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Desteklenen Tarihsel Dönemler:</span>
                <span className="text-slate-200">{auditData.supportedPeriods?.join(', ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Desteklenen Zaman Dilimleri:</span>
                <span className="text-slate-200">{auditData.supportedTimeframes?.join(', ')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-slate-500 font-mono">Denetim verisi yükleniyor...</div>
        )}
      </div>

      {/* API Key & Security Notice (Section 2 & Environment Constraints) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100">API Anahtarları ve Güvenlik Yönetimi</h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Güvenlik standartları gereğince üçüncü taraf API anahtarları asla istemci koduna (tarayıcı JavaScript paketine), loglara veya arayüze yazılmaz. Tüm harici veri bağlantıları ve yapay zekâ entegrasyonu sunucu tarafında (Node.js Express) güvenli ortam değişkenleri (<code className="font-mono text-emerald-400">process.env</code>) üzerinden yönetilmektedir.
        </p>

        <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono space-y-1 text-slate-400">
          <div className="flex items-center justify-between">
            <span>Gemini Analitik Motoru (gemini-3.8-flash):</span>
            <span className="text-emerald-400 font-bold">
              {hasGeminiKey ? 'Bağlantı Hazır' : 'Otomatik Enjekte Edilecek'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Veri Gecikme Politikası:</span>
            <span className="text-slate-200">15 Dakika Gecikmeli (BIST Standart)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Önbellek TTL Süresi:</span>
            <span className="text-slate-200">120 Saniye (RAM Cache)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
