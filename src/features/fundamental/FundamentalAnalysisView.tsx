import React, { useState, useEffect } from 'react';
import { BISTStock, StockFundamentalCenterData } from '../../types';
import { apiClient } from '../../services/apiClient';
import { FundamentalAnalysisCenter } from '../detail/components/FundamentalAnalysisCenter';
import {
  Scale,
  Search,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart2,
  Activity,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

interface FundamentalAnalysisViewProps {
  symbol: string;
  stocks: BISTStock[];
  onSelectStock: (symbol: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const FundamentalAnalysisView: React.FC<FundamentalAnalysisViewProps> = ({
  symbol,
  stocks,
  onSelectStock,
  onNavigateTab
}) => {
  const [stock, setStock] = useState<BISTStock | null>(null);
  const [fundamentalData, setFundamentalData] = useState<StockFundamentalCenterData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  const loadFundamental = async (targetSymbol: string) => {
    setIsLoading(true);
    try {
      const [stockRes, fundRes] = await Promise.all([
        apiClient.getStock(targetSymbol).catch(() => stocks.find(s => s.symbol === targetSymbol.toUpperCase()) || null),
        apiClient.getFundamentalData(targetSymbol)
      ]);
      if (stockRes) setStock(stockRes);
      setFundamentalData(fundRes);
    } catch {
      const found = stocks.find(s => s.symbol === targetSymbol.toUpperCase()) || null;
      setStock(found);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFundamental(symbol);
  }, [symbol]);

  const filteredStocks = searchQuery
    ? stocks
        .filter(
          s =>
            s.symbol.includes(searchQuery.toUpperCase()) ||
            s.name.toUpperCase().includes(searchQuery.toUpperCase())
        )
        .slice(0, 10)
    : [];

  const currentStock = stock || fundamentalData?.stock || stocks.find(s => s.symbol === symbol);
  const isPos = (currentStock?.changePercent || 0) >= 0;

  return (
    <div className="space-y-5 pb-12">
      {/* Top Window Header (Matches TechnicalAnalysisView window style) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Scale className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-100 font-mono tracking-tight">
                {symbol} · Temel Analiz Merkezi
              </h1>
              {currentStock && (
                <span className="text-xs text-slate-400 font-medium">
                  · {currentStock.name} ({currentStock.sector})
                </span>
              )}
              {currentStock?.dataStatus === 'VERIFIED' && (
                <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Doğrulanmış Veri
                </span>
              )}
            </div>

            {currentStock && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                <span>
                  Son Fiyat: <strong className="text-slate-100">{currentStock.lastPrice.toFixed(2)} TL</strong>
                </span>
                <span className="text-slate-600">·</span>
                <span className={`font-bold flex items-center gap-1 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  Günlük: {isPos ? `+${currentStock.changePercent.toFixed(2)}%` : `${currentStock.changePercent.toFixed(2)}%`}
                </span>
                <span className="text-slate-600">·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  15 Dk Gecikmeli BIST Pay Verisi
                </span>
              </div>
            )}

            {/* Quick Stock Switcher */}
            <div className="relative pt-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Temel analiz için hisse değiştir (örn. THYAO, GARAN, ASELS)..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  className="bg-transparent border-b border-slate-800 focus:border-emerald-500 text-xs text-slate-200 placeholder-slate-500 outline-none pb-0.5 w-80"
                />
              </div>

              {isSearchOpen && filteredStocks.length > 0 && (
                <div className="absolute left-0 mt-1 w-80 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-30 py-1 max-h-56 overflow-y-auto">
                  {filteredStocks.map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => {
                        onSelectStock(s.symbol);
                        setSearchQuery('');
                        setIsSearchOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 flex items-center justify-between transition-colors border-b border-slate-900 last:border-0"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-100">{s.symbol}</span>
                        <span className="text-[11px] text-slate-400 ml-2 truncate max-w-[150px] inline-block align-bottom">
                          {s.name}
                        </span>
                      </div>
                      <span className="font-mono text-slate-300 font-semibold">{s.lastPrice.toFixed(2)} TL</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Quick Navigation Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => loadFundamental(symbol)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              Verileri Yenile
            </button>
            <button
              onClick={() => onNavigateTab('detail')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              Hisse Detayı &amp; Grafik
            </button>
            <button
              onClick={() => onNavigateTab('technical')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Activity className="w-3.5 h-3.5" />
              Teknik Analiz Penceresi
            </button>
          </div>
        </div>
      </div>

      {/* Main Fundamental Analysis Center */}
      <FundamentalAnalysisCenter
        data={fundamentalData}
        isLoading={isLoading}
        onRefresh={() => loadFundamental(symbol)}
        selectedSymbol={symbol}
      />
    </div>
  );
};
