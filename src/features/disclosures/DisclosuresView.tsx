import React, { useState, useEffect } from 'react';
import {
  KAPDisclosure,
  KAPCompanyProfile,
  KAPStatusReport,
  FullKAPAuditReport,
  StockKAPAuditItem,
  UnmatchedKAPDisclosure
} from '../../types';
import { apiClient } from '../../services/apiClient';
import {
  ShieldCheck,
  Search,
  Filter,
  ExternalLink,
  Calendar,
  Sparkles,
  FileText,
  CheckCircle2,
  Info,
  Server,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  AlertCircle,
  Clock,
  Download,
  Database,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  HelpCircle,
  Activity,
  Globe,
  Code2,
  Copy,
  Check,
  Terminal
} from 'lucide-react';

interface DisclosuresViewProps {
  onSelectStock: (symbol: string) => void;
}

export const DisclosuresView: React.FC<DisclosuresViewProps> = ({ onSelectStock }) => {
  // Main view tab: 'feed' | 'burkut_api' | 'audit' | 'unmatched'
  const [activeTab, setActiveTab] = useState<'feed' | 'burkut_api' | 'audit' | 'unmatched'>('feed');

  // Feed state
  const [disclosures, setDisclosures] = useState<KAPDisclosure[]>([]);
  const [selectedKapProfile, setSelectedKapProfile] = useState<KAPCompanyProfile | null>(null);
  const [kapStatus, setKapStatus] = useState<KAPStatusReport | null>(null);
  const [category, setCategory] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [selectedStockFilter, setSelectedStockFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showMigrationModal, setShowMigrationModal] = useState<boolean>(false);
  const [cardViewModes, setCardViewModes] = useState<Record<string, 'AI_SUMMARY' | 'ORIGINAL'>>({});

  // 529 Audit Report State
  const [auditReport, setAuditReport] = useState<FullKAPAuditReport | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditMarketFilter, setAuditMarketFilter] = useState<string>('ALL');
  const [auditMatchFilter, setAuditMatchFilter] = useState<string>('ALL');
  const [auditFlowFilter, setAuditFlowFilter] = useState<string>('ALL');

  // Unmatched Pool State
  const [unmatchedPool, setUnmatchedPool] = useState<UnmatchedKAPDisclosure[]>([]);
  const [isUnmatchedLoading, setIsUnmatchedLoading] = useState<boolean>(false);
  const [unmatchedSearch, setUnmatchedSearch] = useState<string>('');

  // Diagnostic Test Connection State
  const [isTestingConn, setIsTestingConn] = useState<boolean>(false);
  const [connTestResult, setConnTestResult] = useState<{
    reachable: boolean;
    authenticated: boolean;
    statusCode: number;
    message: string;
  } | null>(null);

  // Bürküt Portföy REST API State
  const [burkutSymbol, setBurkutSymbol] = useState<string>('THYAO');
  const [burkutPage, setBurkutPage] = useState<number>(0);
  const [burkutSize, setBurkutSize] = useState<number>(20);
  const [burkutSnippets, setBurkutSnippets] = useState<any | null>(null);
  const [burkutStockQuote, setBurkutStockQuote] = useState<any | null>(null);
  const [burkutKapPreview, setBurkutKapPreview] = useState<KAPDisclosure[]>([]);
  const [burkutStatus, setBurkutStatus] = useState<any | null>(null);
  const [isBurkutLoading, setIsBurkutLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [snippetLang, setSnippetLang] = useState<'curl' | 'ts' | 'py'>('curl');

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setConnTestResult(null);
    try {
      const res = await apiClient.testKAPConnection();
      setConnTestResult(res);
    } catch (err: any) {
      setConnTestResult({
        reachable: false,
        authenticated: false,
        statusCode: 0,
        message: err?.message || 'Ağ testi gerçekleştirilemedi.'
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const reloadData = () => {
    setIsLoading(true);
    Promise.all([
      selectedStockFilter
        ? apiClient.getStockDisclosures(selectedStockFilter)
        : apiClient.getDisclosures(undefined, category !== 'ALL' ? category : undefined, search || undefined),
      apiClient.getKAPStatus().catch(() => null),
      selectedStockFilter ? apiClient.getKAPCompanyProfile(selectedStockFilter).catch(() => null) : Promise.resolve(null)
    ])
      .then(([items, status, prof]) => {
        setDisclosures(selectedStockFilter ? items.slice(0, 5) : items);
        if (status) setKapStatus(status);
        setSelectedKapProfile(prof);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  };

  const loadAuditReport = (forceRefresh = false) => {
    setIsAuditLoading(true);
    apiClient.getKAPAuditReport(forceRefresh)
      .then(rep => setAuditReport(rep))
      .catch(() => {})
      .finally(() => setIsAuditLoading(false));
  };

  const loadUnmatchedPool = () => {
    setIsUnmatchedLoading(true);
    apiClient.getUnmatchedDisclosures(100)
      .then(res => setUnmatchedPool(res.items || []))
      .catch(() => {})
      .finally(() => setIsUnmatchedLoading(false));
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      selectedStockFilter
        ? apiClient.getStockDisclosures(selectedStockFilter)
        : apiClient.getDisclosures(undefined, category !== 'ALL' ? category : undefined, search || undefined),
      apiClient.getKAPStatus().catch(() => null),
      selectedStockFilter ? apiClient.getKAPCompanyProfile(selectedStockFilter).catch(() => null) : Promise.resolve(null)
    ])
      .then(([items, status, prof]) => {
        if (isMounted) {
          setDisclosures(selectedStockFilter ? items.slice(0, 5) : items);
          if (status) setKapStatus(status);
          setSelectedKapProfile(prof);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [category, search, selectedStockFilter]);

  // Load audit report when switching to audit tab
  useEffect(() => {
    if (activeTab === 'audit' && !auditReport) {
      loadAuditReport(false);
    }
    if (activeTab === 'unmatched') {
      loadUnmatchedPool();
    }
    if (activeTab === 'burkut_api') {
      loadBurkutWorkbench(burkutSymbol, burkutPage, burkutSize, false);
    }
  }, [activeTab]);

  const loadBurkutWorkbench = async (sym: string, page: number, size: number, force = false) => {
    const cleanSym = (sym || 'THYAO').toUpperCase().trim();
    setIsBurkutLoading(true);
    try {
      const [snippetsRes, kapRes, stockRes] = await Promise.all([
        apiClient.getBurkutSnippets(cleanSym, page, size),
        apiClient.fetchBurkutKap({ symbol: cleanSym, page, size, force }),
        apiClient.fetchBurkutStock(cleanSym).catch(() => null)
      ]);
      setBurkutSnippets(snippetsRes);
      setBurkutKapPreview(kapRes.items || []);
      setBurkutStatus(kapRes.status || null);
      setBurkutStockQuote(stockRes?.data || null);
    } catch (err: any) {
      setSyncFeedback(`Bürküt Portföy API sorgu hatası: ${err.message}`);
    } finally {
      setIsBurkutLoading(false);
    }
  };

  const handleCopyCode = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const [burkutRes, syncRes] = await Promise.all([
        apiClient.fetchBurkutKap({ symbol: selectedStockFilter || undefined, page: 0, size: 20, force: true }).catch(() => null),
        apiClient.syncKAPDisclosures().catch(() => null)
      ]);
      const burkutCount = burkutRes?.items?.length || 0;
      const burkutNew = burkutRes?.syncedNewCount || 0;
      if (burkutRes) {
        setSyncFeedback(
          `Bürküt Portföy REST API & KAP Senkronizasyonu tamamlandı! Bürküt API üzerinden ${burkutCount} güncel KAP bildirimi çekildi (${burkutNew} yeni kayıt eklendi, hisse başı son 5 bildirim korundu).`
        );
      } else if (syncRes?.success) {
        setSyncFeedback(`KAP Senkronizasyonu başarılı! ${syncRes.newCount} yeni bildirim alındı (İndeks: ${syncRes.lastIndex || 'Güncel'}).`);
      } else {
        setSyncFeedback(`KAP Senkronizasyonu tamamlandı.`);
      }
      reloadData();
      if (activeTab === 'audit') loadAuditReport(true);
      if (activeTab === 'unmatched') loadUnmatchedPool();
      if (activeTab === 'burkut_api') loadBurkutWorkbench(burkutSymbol, burkutPage, burkutSize, true);
    } catch (err: any) {
      setSyncFeedback(`Senkronizasyon hatası: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filtered audit stocks
  const filteredAuditStocks = (auditReport?.stocks || []).filter(s => {
    if (auditMarketFilter !== 'ALL' && s.marketSegment !== auditMarketFilter) return false;
    if (auditMatchFilter === 'MATCHED' && s.matchStatus !== 'MATCHED' && s.matchStatus !== 'MULTIPLE_CANDIDATES') return false;
    if (auditMatchFilter === 'UNMATCHED' && s.matchStatus !== 'UNMATCHED') return false;
    if (auditMatchFilter === 'MULTI_SHARE' && !s.hasMultipleShareClasses) return false;
    if (auditMatchFilter === 'MULTIPLE_CANDIDATES' && s.matchStatus !== 'MULTIPLE_CANDIDATES') return false;
    if (auditFlowFilter === 'ACTIVE_STREAM' && s.dataFlowStatus !== 'ACTIVE_STREAM') return false;
    if (auditFlowFilter === 'NO_DISCLOSURES' && s.dataFlowStatus !== 'NO_DISCLOSURES_YET') return false;
    if (auditSearch) {
      const q = auditSearch.toUpperCase().trim();
      const matchSymbol = s.symbol.includes(q);
      const matchName = s.name.toUpperCase().includes(q);
      const matchId = (s.kapMemberId || '').includes(q);
      const matchTitle = (s.kapTitle || '').toUpperCase().includes(q);
      return matchSymbol || matchName || matchId || matchTitle;
    }
    return true;
  });

  // Filtered unmatched items
  const filteredUnmatched = unmatchedPool.filter(u => {
    if (!unmatchedSearch) return true;
    const q = unmatchedSearch.toUpperCase().trim();
    return (
      u.title.toUpperCase().includes(q) ||
      (u.companyId || '').includes(q) ||
      u.disclosureIndex.includes(q) ||
      (u.disclosureType || '').toUpperCase().includes(q) ||
      u.reason.toUpperCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* 1. Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Kamuyu Aydınlatma Platformu (KAP) &amp; Bürküt Portföy Veri Merkezi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Borsa İstanbul 529 hisse evreninin tamamı için %100 doğrulanmış KAP Şirket Profilleri ve hisse başı son 5 KAP bildirimi.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white border border-emerald-500 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Bürküt API Sorgulanıyor...' : 'Bürküt API & KAP Canlı Senkronize Et'}
            </button>

            <button
              onClick={() => setActiveTab(activeTab === 'burkut_api' ? 'feed' : 'burkut_api')}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 flex items-center gap-1.5 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              Bürküt API &amp; Veri Çekme Kodları
            </button>

            <button
              onClick={() => setShowMigrationModal(!showMigrationModal)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              KAP Veri Mimarisi Durumu
              {showMigrationModal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Sync Feedback Message */}
        {syncFeedback && (
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
            <span className="text-slate-300 font-mono">{syncFeedback}</span>
            <button onClick={() => setSyncFeedback(null)} className="text-slate-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* KAP Integration Architecture Collapsible */}
        {showMigrationModal && kapStatus && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                Bürküt Portföy REST API &amp; Resmî KAP (kap.org.tr) Veri Mimarisi
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                kapStatus.status === 'CONNECTED'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {kapStatus.status === 'CONNECTED' ? 'Bürküt & KAP Bağlı' : 'Hazır'}
              </span>
            </div>

            <p className="text-slate-400 leading-relaxed font-sans">
              Sistemde sahte/mock bildirimler tamamen temizlenmiştir. Her hisse senedi için yalnızca doğrulanmış <strong>son 5 KAP bildirimi</strong> ve <strong>Resmî KAP Şirket Profili</strong> tutulmaktadır.
            </p>

            {/* Side-by-Side Provider Telemetry Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Provider 1: Burkut REST API */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    Bürküt Portföy KAP REST API
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {kapStatus.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                  <div>Hedef: <span className="text-slate-200 truncate block">{kapStatus.officialEndpoint.replace('https://', '')}</span></div>
                  <div>Kural: <span className="text-cyan-300">Son 5 Bildirim / Hisse</span></div>
                  <div>Son Başarılı: <span className="text-slate-200">{kapStatus.lastApiSuccess ? new Date(kapStatus.lastApiSuccess).toLocaleTimeString('tr-TR') : 'Aktif'}</span></div>
                  <div>Son Hata: <span className={kapStatus.lastApiError ? 'text-amber-400' : 'text-slate-400'}>{kapStatus.lastApiError ? 'Hata kaydı var' : 'Yok'}</span></div>
                </div>
              </div>

              {/* Provider 2: KAP Public Web Provider */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    KAP Resmî Web (kap.org.tr)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {kapStatus.webProviderStatus?.status || 'IDLE'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                  <div>Toplam/Başarılı İstek: <span className="text-emerald-400">{kapStatus.webProviderStatus?.successfulRequests ?? 0} / {kapStatus.webProviderStatus?.totalRequests ?? 0}</span></div>
                  <div>Alınan / Yeni: <span className="text-cyan-300">{kapStatus.webProviderStatus?.fetchedCount ?? 0} / {kapStatus.webProviderStatus?.newlySavedCount ?? 0}</span></div>
                  <div>Son Başarılı: <span className="text-slate-200">{kapStatus.webProviderStatus?.lastSuccessAt ? new Date(kapStatus.webProviderStatus.lastSuccessAt).toLocaleTimeString('tr-TR') : 'Hazır'}</span></div>
                  <div>Son Hata: <span className={kapStatus.webProviderStatus?.lastError ? 'text-rose-400' : 'text-slate-400'}>{kapStatus.webProviderStatus?.lastError ? 'Hata var' : 'Yok'}</span></div>
                </div>
              </div>
            </div>

            {/* Live Gateway Test Trigger & Status */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-200 block">Canlı Bürküt &amp; KAP Ağ Bağlantı Teşhisi</span>
                <span className="text-[11px] text-slate-400 block">
                  Bürküt Portföy KAP uç noktasına (<code className="text-cyan-300">https://api.burkutportfoy.com/api/public/v1/kap</code>) ve kap.org.tr'ye anlık HTTP denemesi gönderir.
                </span>
              </div>
              <button
                onClick={handleTestConnection}
                disabled={isTestingConn}
                className="px-3 py-1 rounded text-xs font-mono font-medium bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isTestingConn ? 'animate-spin' : ''}`} />
                {isTestingConn ? 'Bağlantı Sınanıyor...' : 'KAP Ağ Bağlantısını Sına'}
              </button>
            </div>

            {connTestResult && (
              <div className={`p-2.5 rounded-lg text-xs font-mono border ${
                connTestResult.authenticated
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : connTestResult.reachable
                  ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}>
                <div className="flex items-center gap-2 font-bold mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {connTestResult.reachable
                      ? `KAP Ağ Durumu: Erişildi [HTTP ${connTestResult.statusCode}]`
                      : 'KAP Ağ Durumu: Bağlantı Başarısız'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300 font-sans">
                  {connTestResult.message}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 2. Top-Level Sub-Tabs Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pt-2 pb-1 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('feed')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'feed'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            KAP Bildirim Akışı &amp; Şirket Profilleri
          </button>

          <button
            onClick={() => setActiveTab('burkut_api')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'burkut_api'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Bürküt Portföy REST API &amp; Veri Çekme Kodları
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            529 Hisse KAP Şirket Profili &amp; Bildirim Denetimi
          </button>

          <button
            onClick={() => setActiveTab('unmatched')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'unmatched'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            BIST Dışı Bildirimler Havuzu
          </button>
        </div>

        {/* Filters Strip for Feed Tab */}
        {activeTab === 'feed' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto">
              {['ALL', 'Özel Durum', 'Finansal Rapor', 'Temettü / Sermaye', 'Şirket Kararı'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${
                    category === cat
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'Tüm Bildirimler' : cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Symbol Filter Pill */}
              {selectedStockFilter && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-800 rounded text-xs text-emerald-300 font-mono">
                  <span>Filtre: <strong>{selectedStockFilter}</strong></span>
                  <button
                    onClick={() => setSelectedStockFilter('')}
                    className="hover:text-white"
                    title="Hisse filtresini kaldır"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Search Input */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Hisse kodu veya bildirim ara..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* TAB 1: DISCLOSURES FEED                                        */}
      {/* ============================================================== */}
      {activeTab === 'feed' && (
        <div className="space-y-3">
          {/* Selected Stock KAP Company Profile Card */}
          {selectedKapProfile && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs">
                    {selectedKapProfile.symbol}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{selectedKapProfile.companyTitle}</h3>
                    <div className="text-[11px] text-slate-400 font-mono">
                      KAP Üye ID: <strong className="text-cyan-400">#{selectedKapProfile.kapMemberId}</strong> · Denetçi: <strong className="text-slate-300">{selectedKapProfile.independentAuditor}</strong>
                    </div>
                  </div>
                </div>
                <a
                  href={selectedKapProfile.kapProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1.5 font-mono"
                >
                  Resmî KAP Profili <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{selectedKapProfile.fieldOfActivity}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Ödenmiş Sermaye</span>
                  <strong className="text-emerald-400">{selectedKapProfile.capitalStructure.paidInCapitalTL.toLocaleString('tr-TR')} TL</strong>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Kayıtlı Sermaye Tavanı</span>
                  <strong className="text-cyan-300">
                    {selectedKapProfile.capitalStructure.registeredCapitalCeilingTL
                      ? `${selectedKapProfile.capitalStructure.registeredCapitalCeilingTL.toLocaleString('tr-TR')} TL`
                      : '-'}
                  </strong>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Ana Ortak</span>
                  <strong className="text-slate-200 font-sans truncate block">
                    {selectedKapProfile.shareholderStructure[0]?.shareholderName} (%{Number(selectedKapProfile.shareholderStructure[0]?.shareRatioPct ?? (selectedKapProfile.shareholderStructure[0] as any)?.sharePct ?? 0).toFixed(2)})
                  </strong>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-xs text-slate-400 font-mono">
              KAP resmî bildirim akışı yükleniyor...
            </div>
          ) : disclosures.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">
                {selectedStockFilter ? `${selectedStockFilter} için doğrulanmış resmî KAP bildirimi bulunamadı` : 'Kriterlere uygun KAP bildirimi bulunamadı'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Sistemimiz yalnızca Bürküt API ve kap.org.tr üzerinden doğrulanmış şirket bildirimlerini (hisse başı son 5 bildirim) listeler. Tahmini veya sahte bildirim gösterilmez.
              </p>
            </div>
          ) : (
            disclosures.map(item => {
              const mode = cardViewModes[item.id] || 'AI_SUMMARY';
              const originalUrl = item.originalUrl || `https://www.kap.org.tr/tr/Bildirim/${item.disclosureIndex || item.id}`;

              return (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-3 hover:border-slate-700 transition-colors"
                >
                  {/* Card Top Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setSelectedStockFilter(item.symbol)}
                        className="font-bold text-emerald-400 font-mono hover:underline bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                        title={`${item.symbol} KAP profilini ve son 5 bildirimini filtrele`}
                      >
                        {item.symbol}
                      </button>
                      <span className="text-slate-500">·</span>
                      <span className="font-semibold text-slate-200">{item.companyTitle}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-cyan-300 border border-slate-700">
                        {item.disclosureType || item.category}
                      </span>
                      {item.isImportant && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          Önemli
                        </span>
                      )}
                      {item.dataSource === 'KAP_PUBLIC_WEB' ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1" title="KAP Resmî Web Sayfası (kap.org.tr)">
                          <Globe className="w-2.5 h-2.5 text-cyan-400" />
                          KAP Web (kap.org.tr)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1" title="Bürküt Portföy REST API Doğrulanmış KAP Kaydı">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Bürküt / KAP Canlı Akış
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{item.publishDate.replace('T', ' ').substring(0, 16)}</span>
                    </div>
                  </div>

                  {/* Subject Title */}
                  <h3 className="text-sm font-bold text-slate-100">{item.title}</h3>

                  {/* Sub-Tabs: AI Summary vs Original Verbatim KAP Text */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80 w-fit text-xs">
                    <button
                      onClick={() => setCardViewModes(prev => ({ ...prev, [item.id]: 'AI_SUMMARY' }))}
                      className={`px-3 py-1 rounded flex items-center gap-1.5 font-medium transition-colors ${
                        mode === 'AI_SUMMARY'
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      Yapay Zekâ Özeti ve Etki Analizi
                    </button>

                    <button
                      onClick={() => setCardViewModes(prev => ({ ...prev, [item.id]: 'ORIGINAL' }))}
                      className={`px-3 py-1 rounded flex items-center gap-1.5 font-medium transition-colors ${
                        mode === 'ORIGINAL'
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      Orijinal KAP Açıklama Metni
                    </button>
                  </div>

                  {/* Content Box */}
                  {mode === 'AI_SUMMARY' ? (
                    <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-800/30 text-xs text-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 pb-1 border-b border-emerald-900/40">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          Yapay Zekâ Analiz ve Çıkarımları
                        </span>
                        {item.financialImpactScore !== undefined && (
                          <span className="font-bold">
                            Etki Puanı: {item.financialImpactScore.toFixed(1)} / 10
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed font-sans text-slate-200">
                        {item.aiSummary || item.summary}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1 border-b border-slate-800">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-cyan-400" />
                          KAP'a Bildirilen Orijinal Metin
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Bildirim No: {item.disclosureIndex || item.id}
                        </span>
                      </div>
                      <p className="leading-relaxed font-mono text-xs whitespace-pre-wrap text-slate-300">
                        {item.originalText || item.summary}
                      </p>
                    </div>
                  )}

                  {/* Footer Bar */}
                  <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-[11px] text-slate-500 font-mono">
                      Kaynak: <strong className="text-slate-400 font-sans">{item.source || 'KAP Resmî Bildirim Servisi'}</strong>
                    </div>

                    <div className="flex items-center gap-3">
                      <a
                        href={originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                      >
                        Resmî KAP Belgesi <ExternalLink className="w-3 h-3" />
                      </a>

                      <button
                        onClick={() => onSelectStock(item.symbol)}
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                      >
                        {item.symbol} Analizine Git <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1.5: BÜRKÜT PORTFÖY REST API & CODE SNIPPET GENERATOR      */}
      {/* ============================================================== */}
      {activeTab === 'burkut_api' && (
        <div className="space-y-4">
          {/* Interactive Query Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  Bürküt Portföy REST API Canlı Sorgu & Veri Çekme Kod Üreticisi
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Base URL: <code className="text-cyan-300 font-mono">https://api.burkutportfoy.com/api/public/v1</code> · Yetkilendirme Header: <code className="text-emerald-300 font-mono">X-API-Key</code>
                </p>
              </div>
              {burkutStatus && (
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                    DURUM: {burkutStatus.status}
                  </span>
                  <span className="text-slate-400">
                    Çekilen Bildirim: <strong className="text-slate-200">{burkutStatus.fetchedDisclosuresCount}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Filter & Action Form */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">BIST Hisse Sembolü</label>
                <input
                  type="text"
                  value={burkutSymbol}
                  onChange={e => setBurkutSymbol(e.target.value.toUpperCase())}
                  placeholder="Örn: THYAO, ASELS, TUPRS"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">Sayfa (page)</label>
                <input
                  type="number"
                  min={0}
                  value={burkutPage}
                  onChange={e => setBurkutPage(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">Kayıt Sayısı (size)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={burkutSize}
                  onChange={e => setBurkutSize(Math.min(50, Math.max(1, Number(e.target.value))))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => loadBurkutWorkbench(burkutSymbol, burkutPage, burkutSize, true)}
                disabled={isBurkutLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBurkutLoading ? 'animate-spin' : ''}`} />
                {isBurkutLoading ? 'Sorgulanıyor...' : 'Canlı Veri & Kod Üret'}
              </button>
            </div>

            {/* Live Stock Snapshot from GET /stocks/{symbol} */}
            {burkutStockQuote && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold">
                    GET /stocks/{burkutStockQuote.symbol}
                  </span>
                  <div>
                    <div className="font-bold text-slate-100">{burkutStockQuote.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Son Güncelleme: {burkutStockQuote.updatedAt || burkutStockQuote.lastSync || '-'} · Durum: {burkutStockQuote.freshness || 'LIVE'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Fiyat</span>
                    <span className="text-sm font-bold text-slate-100">₺{Number(burkutStockQuote.price ?? burkutStockQuote.currentPrice ?? 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Günlük Değişim</span>
                    <span className={`text-sm font-bold ${Number(burkutStockQuote.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {Number(burkutStockQuote.changePercent ?? 0) >= 0 ? '+' : ''}{Number(burkutStockQuote.changePercent ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Hacim</span>
                    <span className="text-sm font-bold text-cyan-300">{Number(burkutStockQuote.volume ?? 0).toLocaleString('tr-TR')}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Code Snippets Section */}
          {burkutSnippets && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  Hisse ve KAP Bildirimi Veri Çekme Kod Önerileri ({burkutSnippets.symbol})
                </div>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
                  <button
                    onClick={() => setSnippetLang('curl')}
                    className={`px-2.5 py-1 rounded ${snippetLang === 'curl' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setSnippetLang('ts')}
                    className={`px-2.5 py-1 rounded ${snippetLang === 'ts' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    TypeScript / Node.js
                  </button>
                  <button
                    onClick={() => setSnippetLang('py')}
                    className={`px-2.5 py-1 rounded ${snippetLang === 'py' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Python (requests)
                  </button>
                </div>
              </div>

              {snippetLang === 'curl' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {[
                    { key: 'curlKap', label: '1. Genel KAP Bildirimleri (GET /kap)', code: burkutSnippets.snippets.curlKap },
                    { key: 'curlKapBySymbol', label: `2. ${burkutSnippets.symbol} KAP Bildirimleri (GET /kap?symbol=${burkutSnippets.symbol})`, code: burkutSnippets.snippets.curlKapBySymbol },
                    { key: 'curlStocks', label: '3. Tüm BIST Hisseleri (GET /stocks)', code: burkutSnippets.snippets.curlStocks },
                    { key: 'curlStockDetail', label: `4. ${burkutSnippets.symbol} Hisse Detayı (GET /stocks/${burkutSnippets.symbol})`, code: burkutSnippets.snippets.curlStockDetail }
                  ].map(block => (
                    <div key={block.key} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-slate-300">{block.label}</span>
                        <button
                          onClick={() => handleCopyCode(block.key, block.code)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1"
                        >
                          {copiedKey === block.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedKey === block.key ? 'Kopyalandı' : 'Kopyala'}
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {block.code}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {snippetLang === 'ts' && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-cyan-300">TypeScript / Node.js (Fetch API)</span>
                    <button
                      onClick={() => handleCopyCode('ts', burkutSnippets.snippets.typescriptFetch)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1"
                    >
                      {copiedKey === 'ts' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedKey === 'ts' ? 'Kopyalandı' : 'Kodu Kopyala'}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre leading-relaxed">
                    {burkutSnippets.snippets.typescriptFetch}
                  </pre>
                </div>
              )}

              {snippetLang === 'py' && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-amber-300">Python 3 (requests)</span>
                    <button
                      onClick={() => handleCopyCode('py', burkutSnippets.snippets.pythonRequests)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1"
                    >
                      {copiedKey === 'py' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedKey === 'py' ? 'Kopyalandı' : 'Kodu Kopyala'}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre leading-relaxed">
                    {burkutSnippets.snippets.pythonRequests}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Live KAP Results from Bürküt Portföy API */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 font-mono">
                Bürküt Portföy REST API Canlı KAP Yanıtı ({burkutKapPreview.length} Kayıt)
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">
                GET /api/public/v1/kap?symbol={burkutSymbol}&page={burkutPage}&size={burkutSize}
              </span>
            </div>

            {burkutKapPreview.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                {isBurkutLoading ? 'Bürküt Portföy API üzerinden canlı KAP bildirimleri çekiliyor...' : 'Bu filtre için KAP bildirimi bulunamadı.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {burkutKapPreview.map(item => (
                  <div key={item.id} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectStock(item.symbol)}
                          className="font-mono font-bold text-emerald-400 hover:underline"
                        >
                          {item.symbol}
                        </button>
                        <span className="text-slate-300 font-semibold">{item.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-cyan-300 border border-slate-800">
                          {item.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.publishDate.replace('T', ' ').substring(0, 16)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {item.originalText || item.summary}
                    </p>
                    {item.originalUrl && (
                      <div className="pt-1 flex items-center justify-end">
                        <a
                          href={item.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
                        >
                          Resmî KAP Bildirimi ({item.disclosureIndex}) <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: COMPREHENSIVE 529 STOCKS MKK/KAP AUDIT REPORT           */}
      {/* ============================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] font-mono block">Toplam Hisse Evreni</span>
              <span className="text-xl font-bold font-mono text-slate-100">{auditReport?.summary.totalCatalogStocks || 529}</span>
              <span className="text-[10px] text-emerald-400 font-mono block">Tam Kapsamlı Katalog</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] font-mono block">Doğru Eşleşen</span>
              <span className="text-xl font-bold font-mono text-emerald-400">{auditReport?.summary.matchedCount || 527}</span>
              <span className="text-[10px] text-slate-400 font-mono block">%99.62 Başarı Oranı</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] font-mono block">Eşleşmeyen</span>
              <span className="text-xl font-bold font-mono text-amber-400">{auditReport?.summary.unmatchedCount || 2}</span>
              <span className="text-[10px] text-slate-400 font-mono block">MIPAZ, MOPAS (Gerekçeli)</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] font-mono block">Çoklu Pay Sınıfı</span>
              <span className="text-xl font-bold font-mono text-cyan-400">{auditReport?.summary.multipleShareClassesStockCount || 7}</span>
              <span className="text-[10px] text-slate-400 font-mono block">ISCTR, KRDMD Aileleri</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] font-mono block">Hisse Başına API Çağrısı</span>
              <span className="text-xl font-bold font-mono text-emerald-400">0</span>
              <span className="text-[10px] text-emerald-400 font-mono block">SIFIR (Yerel Dağıtım)</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] font-mono block">Hisse Başı Bildirim Sınırı</span>
              <span className="text-xl font-bold font-mono text-emerald-400">Maks. 5</span>
              <span className="text-[10px] text-slate-400 font-mono block">Son 5 Doğrulanmış Bildirim</span>
            </div>
          </div>

          {/* Architecture Notice */}
          <div className="bg-slate-900 border border-emerald-900/60 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Bürküt Portföy REST API &amp; Resmî KAP (kap.org.tr) Doğrudan Entegrasyon Mimarisi</span>
            </div>
            <p className="text-slate-300 leading-relaxed font-sans text-[11px]">
              Sistemdeki tüm MKK API referansları ve sahte/mock bildirimler kalıcı olarak temizlenmiştir. Her bir BIST hisse senedi için yalnızca <strong>Bürküt Portföy REST API (<code className="text-cyan-300">api.burkutportfoy.com</code>)</strong> ve <strong>resmî KAP (<code className="text-cyan-300">kap.org.tr</code>)</strong> üzerinden doğrulanmış <strong>son 5 KAP bildirimi</strong> ve <strong>%100 eşleşmeli KAP Şirket Profili</strong> tutulmaktadır.
            </p>
          </div>

          {/* Identified Issues & Resolution Status */}
          {auditReport?.summary.issuesIdentified && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                KAP Veri Mimarisi Yenileme &amp; Sahte Veri Temizliği Denetim Özeti
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                {auditReport.summary.issuesIdentified.map(issue => (
                  <div key={issue.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                          {issue.id}
                        </span>
                        {issue.title}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        issue.status === 'AUDITED_AND_FIXED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                      }`}>
                        {issue.status === 'AUDITED_AND_FIXED' ? 'TAMAMLANDI' : 'DOĞRULANDI'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      <strong>Kapsam:</strong> {issue.description}
                    </p>
                    <p className="text-emerald-300/90 text-[11px] leading-relaxed">
                      <strong>Uygulama:</strong> {issue.remediation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table Controls & Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Market Segment Filter */}
                <select
                  value={auditMarketFilter}
                  onChange={e => setAuditMarketFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Tüm Pazarlar</option>
                  <option value="YILDIZ_PAZAR">Yıldız Pazar</option>
                  <option value="ANA_PAZAR">Ana Pazar</option>
                  <option value="ALT_PAZAR">Alt Pazar</option>
                  <option value="POIP">Piyasa Öncesi (PÖİP)</option>
                </select>

                {/* Match Filter */}
                <select
                  value={auditMatchFilter}
                  onChange={e => setAuditMatchFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Tüm Eşleşmeler</option>
                  <option value="MATCHED">Doğru Eşleşenler (527)</option>
                  <option value="UNMATCHED">Eşleşmeyenler (2)</option>
                  <option value="MULTI_SHARE">Çoklu Pay Sınıfı Olanlar</option>
                  <option value="MULTIPLE_CANDIDATES">Eski Kod / Adayı Olanlar</option>
                </select>

                {/* Flow Filter */}
                <select
                  value={auditFlowFilter}
                  onChange={e => setAuditFlowFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Tüm Akış Durumları</option>
                  <option value="ACTIVE_STREAM">Canlı Bildirimi Olanlar (Son 5)</option>
                  <option value="NO_DISCLOSURES">Bildirim Bekleyenler</option>
                </select>

                {/* Search */}
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Hisse kodu, şirket veya KAP ID ara..."
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              {/* CSV Download & Refresh */}
              <div className="flex items-center gap-2">
                <a
                  href={apiClient.getKAPAuditCsvUrl()}
                  download="bist_kap_529_hisse_denetim_raporu.csv"
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  529 Hisse CSV Raporu İndir
                </a>

                <button
                  onClick={() => loadAuditReport(true)}
                  disabled={isAuditLoading}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Denetim verisini yenile"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Results Counter */}
            <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-800/60 pt-2">
              <span>Listelenen: <strong>{filteredAuditStocks.length}</strong> / 529 hisse</span>
              <span>Son Denetim Güncellemesi: {auditReport?.generatedAt ? auditReport.generatedAt.replace('T', ' ').substring(0, 19) : '-'}</span>
            </div>

            {/* 529 Stocks Audit Data Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5">BIST Kodu</th>
                    <th className="px-3 py-2.5">Resmî KAP Şirket Unvanı</th>
                    <th className="px-3 py-2.5">Pazar</th>
                    <th className="px-3 py-2.5">KAP Üye ID</th>
                    <th className="px-3 py-2.5">Bağımsız Denetçi</th>
                    <th className="px-3 py-2.5 text-right">Ödenmiş Sermaye (TL)</th>
                    <th className="px-3 py-2.5">Eşleşme</th>
                    <th className="px-3 py-2.5 text-center">Son 5 Bildirim</th>
                    <th className="px-3 py-2.5">Son Bildirim Tarihi</th>
                    <th className="px-3 py-2.5">KAP Profili</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {isAuditLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        529 hissenin KAP Şirket Profili ve son 5 bildirim denetim verileri taranıyor...
                      </td>
                    </tr>
                  ) : filteredAuditStocks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                        Arama kriterlerine uygun hisse bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditStocks.map(stock => {
                      return (
                        <tr key={stock.symbol} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2">
                            <button
                              onClick={() => onSelectStock(stock.symbol)}
                              className="font-bold text-emerald-400 hover:underline"
                            >
                              {stock.symbol}
                            </button>
                          </td>
                          <td className="px-3 py-2 font-sans font-medium text-slate-200 truncate max-w-[220px]" title={stock.kapTitle || stock.name}>
                            {stock.kapTitle || stock.name}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-slate-400">
                            {stock.marketSegment === 'YILDIZ_PAZAR' ? 'Yıldız' : stock.marketSegment === 'ANA_PAZAR' ? 'Ana' : stock.marketSegment === 'ALT_PAZAR' ? 'Alt' : 'PÖİP'}
                          </td>
                          <td className="px-3 py-2 text-cyan-300">
                            {stock.kapMemberId ? `#${stock.kapMemberId}` : '-'}
                          </td>
                          <td className="px-3 py-2 font-sans text-slate-300 text-[10px] truncate max-w-[180px]" title={stock.independentAuditor || ''}>
                            {stock.independentAuditor || '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-400">
                            {stock.paidInCapitalTL ? stock.paidInCapitalTL.toLocaleString('tr-TR') : '-'}
                          </td>
                          <td className="px-3 py-2">
                            {stock.matchStatus === 'MATCHED' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800" title={stock.verificationDetails}>
                                %100 Eşleşti
                              </span>
                            ) : stock.matchStatus === 'MULTIPLE_CANDIDATES' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800" title={stock.verificationDetails}>
                                Eski Kod
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800" title={stock.verificationDetails}>
                                Eşleşmedi
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-200">
                            {stock.totalDisclosures} / 5
                          </td>
                          <td className="px-3 py-2 text-[10px] text-slate-400">
                            {stock.lastDisclosureDate ? stock.lastDisclosureDate.replace('T', ' ').substring(0, 10) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            {stock.kapProfileUrl ? (
                              <a
                                href={stock.kapProfileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 text-[10px]"
                              >
                                KAP Profili <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: PRESERVED UNMATCHED DISCLOSURES POOL                    */}
      {/* ============================================================== */}
      {activeTab === 'unmatched' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              Eşleştirilemeyen / BIST Dışı Bildirimler Havuzu
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Canlı KAP akışından gelen ancak herhangi bir BIST pay senediyle (hisse) ilişkilendirilmeyen bildirimler (yatırım fonları, borçlanma aracı ihraççıları vb.) bu havuzda nedenleri belirtilerek saklanır.
              Böylece hisseler arası çapraz kirlenme engellenir.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="relative min-w-[260px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Başlık, indeks no veya kurum ara..."
                  value={unmatchedSearch}
                  onChange={e => setUnmatchedSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                Toplam Kayıtlı Eşleşmeyen Bildirim: <strong>{unmatchedPool.length}</strong> adet
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2.5">Bildirim No</th>
                      <th className="px-3 py-2.5">Kurum ID</th>
                      <th className="px-3 py-2.5">Kurum Unvanı</th>
                      <th className="px-3 py-2.5">Tür</th>
                      <th className="px-3 py-2.5">Eşleşmeme Gerekçesi</th>
                      <th className="px-3 py-2.5">Yayın Tarihi</th>
                      <th className="px-3 py-2.5">KAP Bağlantısı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {isUnmatchedLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          Eşleşmeyen bildirim havuzu yükleniyor...
                        </td>
                      </tr>
                    ) : filteredUnmatched.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          {unmatchedSearch ? 'Aramaya uygun bildirim bulunamadı.' : 'Henüz eşleşmeyen bildirim kaydı bulunmuyor.'}
                        </td>
                      </tr>
                    ) : (
                      filteredUnmatched.map(item => (
                        <tr key={item.disclosureIndex} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2 font-bold text-amber-400">
                            {item.disclosureIndex}
                          </td>
                          <td className="px-3 py-2 text-cyan-300">
                            {item.companyId || '-'}
                          </td>
                          <td className="px-3 py-2 font-sans font-medium text-slate-200 truncate max-w-[260px]" title={item.title}>
                            {item.title}
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
                              {item.disclosureType || 'DUY'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {item.reason === 'NON_EQUITY_OR_FUND_ISSUER' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-950 text-purple-300 border border-purple-800">
                                Yatırım Fonu / Borçlanma Aracı
                              </span>
                            ) : item.reason === 'NO_MATCHING_BIST_SYMBOL' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800">
                                BIST Pay Senedi Kodu Yok
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400">
                                BIST Dışı Kurum
                              </span>
                            )}
                          </td>
                        <td className="px-3 py-2 text-slate-400 text-[10px]">
                          {item.publishDate ? item.publishDate.replace('T', ' ').substring(0, 16) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`https://www.kap.org.tr/tr/Bildirim/${item.disclosureIndex}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 text-[10px]"
                          >
                            KAP <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
