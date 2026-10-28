import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  OHLCV,
  SupportResistanceZone,
  AutoChannel,
  UserDrawing,
  MTFConfluenceZone,
  FibonacciAnalysis,
  FibonacciLevel,
  ChartPattern
} from '../types';
import {
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  detectAutoChannels,
  detectChartPatterns
} from '../../server/indicators/technicalEngine';
import {
  TrendingUp,
  Minus,
  Edit3,
  Trash2,
  RotateCcw,
  Layers,
  Save,
  Check,
  ChevronDown,
  Info,
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  Sparkles
} from 'lucide-react';

interface FinancialChartProps {
  candles: OHLCV[];
  symbol: string;
  zones?: SupportResistanceZone[];
  autoChannels?: AutoChannel[];
  patterns?: ChartPattern[];
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  isLoading?: boolean;
  mtfConfluences?: MTFConfluenceZone[];
  fibonacci?: FibonacciAnalysis | null;
  onSelectLevel?: (level: SupportResistanceZone | MTFConfluenceZone | FibonacciLevel) => void;
}

type DrawingMode = 'NONE' | 'TREND_LINE' | 'HORIZONTAL_LINE' | 'SUPPORT_LINE' | 'RESISTANCE_LINE' | 'PARALLEL_CHANNEL';

export const FinancialChart: React.FC<FinancialChartProps> = ({
  candles,
  symbol,
  zones = [],
  autoChannels: propChannels,
  patterns: propPatterns,
  timeframe,
  onTimeframeChange,
  isLoading = false,
  mtfConfluences = [],
  fibonacci = null,
  onSelectLevel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Fullscreen Mode (Kural 8: Analiz Ekranı İçin Tam Ekran Modu)
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev;
      if (next && containerRef.current && containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          // Fallback to CSS fixed fullscreen inside iframes where browser blocks native requestFullscreen
        });
      } else if (!next && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        // Keep state synced if exited via native ESC
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // EMA Overlay toggles (SMA tamamen kaldırıldı, EMA kullanılıyor)
  const [showEma5, setShowEma5] = useState(true);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showAutoChannels, setShowAutoChannels] = useState(true);
  const [showMtf, setShowMtf] = useState(true);
  const [showFib, setShowFib] = useState(true);
  const [showPatterns, setShowPatterns] = useState(true);

  // Interactive Level Details Modal
  const [selectedLevelModal, setSelectedLevelModal] = useState<
    SupportResistanceZone | MTFConfluenceZone | FibonacciLevel | null
  >(null);

  // User Drawing Mode & State (Madde 9)
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('NONE');
  const [userDrawings, setUserDrawings] = useState<UserDrawing[]>([]);
  const [drawingInProgress, setDrawingInProgress] = useState<{ x: number; y: number; price: number; dateStr: string }[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Subplot selection: 'VOLUME' | 'RSI' | 'MACD'
  const [activeSubplot, setActiveSubplot] = useState<'VOLUME' | 'RSI' | 'MACD'>('VOLUME');

  // Kural 7: Son 5 Yıllık Veri ve Grafik Kaydırma (Pan / Scroll) & Zoom Özelliği
  const [zoomLevel, setZoomLevel] = useState<number>(120);
  // panOffset: en güncel mumdan geriye doğru kaç bar kaydırıldığı (0 = en güncel mum sağda)
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isDraggingPan, setIsDraggingPan] = useState<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartOffsetRef = useRef<number>(0);

  // Reset panOffset when symbol or timeframe changes
  useEffect(() => {
    setPanOffset(0);
  }, [symbol, timeframe]);

  const maxPanOffset = useMemo(() => {
    if (!candles || candles.length <= zoomLevel) return 0;
    return Math.max(0, candles.length - zoomLevel);
  }, [candles, zoomLevel]);

  const effectivePanOffset = Math.min(panOffset, maxPanOffset);

  const visibleSliceBounds = useMemo(() => {
    const total = candles?.length || 0;
    if (total === 0) return { startIdx: 0, endIdx: 0 };
    const endIdx = Math.max(1, total - effectivePanOffset);
    const startIdx = Math.max(0, endIdx - zoomLevel);
    return { startIdx, endIdx };
  }, [candles, effectivePanOffset, zoomLevel]);

  const visibleCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return candles.slice(visibleSliceBounds.startIdx, visibleSliceBounds.endIdx);
  }, [candles, visibleSliceBounds]);

  // Load user drawings from localStorage per symbol
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bist_drawings_${symbol}`);
      if (saved) {
        setUserDrawings(JSON.parse(saved));
      } else {
        setUserDrawings([]);
      }
    } catch {
      setUserDrawings([]);
    }
  }, [symbol]);

  const handleSaveDrawings = () => {
    try {
      localStorage.setItem(`bist_drawings_${symbol}`, JSON.stringify(userDrawings));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Çizimler kaydedilemedi:', err);
    }
  };

  const handleClearDrawings = () => {
    setUserDrawings([]);
    setDrawingInProgress([]);
    localStorage.removeItem(`bist_drawings_${symbol}`);
  };

  const handleUndoDrawing = () => {
    if (drawingInProgress.length > 0) {
      setDrawingInProgress([]);
      return;
    }
    const updated = userDrawings.slice(0, -1);
    setUserDrawings(updated);
    localStorage.setItem(`bist_drawings_${symbol}`, JSON.stringify(updated));
  };

  // Pre-calculate indicators across full historical series, then slice to visible window
  const { closes, highs, lows, volumes } = useMemo(() => {
    return {
      closes: candles.map(c => c.close),
      highs: candles.map(c => c.high),
      lows: candles.map(c => c.low),
      volumes: candles.map(c => c.volume)
    };
  }, [candles]);

  const { startIdx, endIdx } = visibleSliceBounds;

  const ema5Series = useMemo(() => calculateEMA(closes, 5).slice(startIdx, endIdx), [closes, startIdx, endIdx]);
  const ema20Series = useMemo(() => calculateEMA(closes, 20).slice(startIdx, endIdx), [closes, startIdx, endIdx]);
  const ema50Series = useMemo(() => calculateEMA(closes, 50).slice(startIdx, endIdx), [closes, startIdx, endIdx]);
  const ema200Series = useMemo(() => calculateEMA(closes, 200).slice(startIdx, endIdx), [closes, startIdx, endIdx]);

  const bbSeries = useMemo(() => {
    const bb = calculateBollingerBands(closes, 20, 2);
    return {
      upper: bb.upper.slice(startIdx, endIdx),
      middle: bb.middle.slice(startIdx, endIdx),
      lower: bb.lower.slice(startIdx, endIdx)
    };
  }, [closes, startIdx, endIdx]);

  const rsiSeries = useMemo(() => calculateRSI(closes, 14).slice(startIdx, endIdx), [closes, startIdx, endIdx]);
  const macdSeries = useMemo(() => {
    const m = calculateMACD(closes);
    return {
      macdLine: m.macdLine.slice(startIdx, endIdx),
      signalLine: m.signalLine.slice(startIdx, endIdx),
      histogram: m.histogram.slice(startIdx, endIdx)
    };
  }, [closes, startIdx, endIdx]);

  const volumeEmaSeries = useMemo(() => calculateEMA(volumes, 20).slice(startIdx, endIdx), [volumes, startIdx, endIdx]);

  // Auto channels
  const channels = useMemo(() => {
    if (propChannels && propChannels.length > 0 && effectivePanOffset === 0) return propChannels;
    return detectAutoChannels(visibleCandles);
  }, [propChannels, visibleCandles, effectivePanOffset]);

  // Kural 5: Otomatik Formasyon Tespiti (Hem ana tarihsel seriden gelen formasyonlar hem de kaydırılan penceredeki aktif formasyonlar)
  const activeChartPatterns = useMemo(() => {
    const detectedOnSlice = detectChartPatterns(visibleCandles, timeframe).map(p => ({
      ...p,
      keyPoints: p.keyPoints?.map(kp => ({
        ...kp,
        // detectChartPatterns on visibleCandles produces barIndex in [0, visibleCandles.length - 1], convert to global index
        barIndex: kp.barIndex + startIdx
      }))
    }));
    if (effectivePanOffset === 0 && propPatterns && propPatterns.length > 0) {
      const merged = [...propPatterns];
      for (const dp of detectedOnSlice) {
        if (!merged.some(m => m.type === dp.type)) {
          merged.push(dp);
        }
      }
      return merged.filter(p => !p.type.startsWith('CHANNEL_'));
    }
    return detectedOnSlice.filter(p => !p.type.startsWith('CHANNEL_'));
  }, [propPatterns, visibleCandles, timeframe, effectivePanOffset, startIdx]);

  // Coordinate math
  const chartWidth = 940;
  const mainHeight = isFullscreen ? 460 : 365;
  const subHeight = isFullscreen ? 130 : 110;
  const paddingRight = 82;
  const paddingLeft = 15;
  const paddingTop = 22;
  const paddingBottom = 25;

  const plotWidth = chartWidth - paddingLeft - paddingRight;

  // Price Scale Bounds (Kural 2: Geçmiş Tarihli Destek ve Dirençlerin de ölçek içinde görünmesi)
  const { minPrice, maxPrice } = useMemo(() => {
    if (visibleCandles.length === 0) return { minPrice: 0, maxPrice: 100 };
    let min = Math.min(...visibleCandles.map(c => c.low));
    let max = Math.max(...visibleCandles.map(c => c.high));

    if (showBollinger) {
      bbSeries.lower.forEach(v => { if (v !== null && v < min) min = v; });
      bbSeries.upper.forEach(v => { if (v !== null && v > max) max = v; });
    }

    if (showZones && zones && zones.length > 0) {
      const windowMid = (min + max) / 2;
      zones.forEach(z => {
        const p = z.price ?? z.pivotPrice;
        if (p && Math.abs(p - windowMid) / (windowMid || 1) <= 0.16) {
          if (p < min) min = p;
          if (p > max) max = p;
        }
      });
    }

    if (showMtf && mtfConfluences && mtfConfluences.length > 0) {
      const windowMid = (min + max) / 2;
      mtfConfluences.forEach(m => {
        if (m.price && Math.abs(m.price - windowMid) / (windowMid || 1) <= 0.16) {
          if (m.price < min) min = m.price;
          if (m.price > max) max = m.price;
        }
      });
    }

    const pad = (max - min) * 0.07 || 1;
    return { minPrice: min - pad, maxPrice: max + pad };
  }, [visibleCandles, showBollinger, bbSeries, showZones, zones, showMtf, mtfConfluences]);

  const priceToY = (price: number) => {
    const range = maxPrice - minPrice || 1;
    return paddingTop + (1 - (price - minPrice) / range) * (mainHeight - paddingTop - paddingBottom);
  };

  const yToPrice = (y: number) => {
    const plotHeight = mainHeight - paddingTop - paddingBottom;
    const ratio = 1 - (y - paddingTop) / plotHeight;
    return minPrice + ratio * (maxPrice - minPrice);
  };

  const candleCount = visibleCandles.length;
  const candleStep = plotWidth / (candleCount || 1);
  const candleWidth = Math.max(1.8, Math.min(14, candleStep * 0.72));

  const getCandleX = (idx: number) => paddingLeft + idx * candleStep + candleStep / 2;

  // Mouse Drag Panning & Hover
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawingMode !== 'NONE') return;
    setIsDraggingPan(true);
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = effectivePanOffset;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || candleCount === 0) return;
    const rect = svgRef.current.getBoundingClientRect();

    if (isDraggingPan && drawingMode === 'NONE') {
      const deltaPx = e.clientX - dragStartXRef.current;
      const barsPerPx = candleCount / (rect.width * 0.85 || 1);
      const deltaBars = Math.round(deltaPx * barsPerPx);
      const nextOffset = Math.max(0, Math.min(maxPanOffset, dragStartOffsetRef.current + deltaBars));
      setPanOffset(nextOffset);
      return;
    }

    const x = e.clientX - rect.left;
    const relativeX = (x / rect.width) * chartWidth - paddingLeft;
    const idx = Math.floor(relativeX / candleStep);
    if (idx >= 0 && idx < candleCount) {
      setHoverIndex(idx);
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseUp = () => {
    setIsDraggingPan(false);
  };

  const handleMouseLeave = () => {
    setIsDraggingPan(false);
    setHoverIndex(null);
  };

  // Touch Drag Panning for Mobile / Tablet
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (drawingMode !== 'NONE' || e.touches.length !== 1) return;
    setIsDraggingPan(true);
    dragStartXRef.current = e.touches[0].clientX;
    dragStartOffsetRef.current = effectivePanOffset;
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!isDraggingPan || !svgRef.current || e.touches.length !== 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const deltaPx = e.touches[0].clientX - dragStartXRef.current;
    const barsPerPx = candleCount / (rect.width * 0.85 || 1);
    const deltaBars = Math.round(deltaPx * barsPerPx);
    const nextOffset = Math.max(0, Math.min(maxPanOffset, dragStartOffsetRef.current + deltaBars));
    setPanOffset(nextOffset);
  };

  const handleTouchEnd = () => {
    setIsDraggingPan(false);
  };

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!candles || candles.length < 20) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const step = Math.max(2, Math.round(zoomLevel * 0.08));
      const dir = e.deltaX > 0 ? -step : step;
      setPanOffset(prev => Math.max(0, Math.min(maxPanOffset, prev + dir)));
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.max(30, Math.round(prev * 0.75)));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.min(candles.length || 1300, Math.round(prev * 1.35)));
  };

  // Canvas Click Handler for User Drawings (Madde 9)
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawingMode === 'NONE' || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const clickY = ((e.clientY - rect.top) / rect.height) * (mainHeight + subHeight);

    if (clickY > mainHeight) return;

    const relativeX = clickX - paddingLeft;
    const idx = Math.max(0, Math.min(candleCount - 1, Math.floor(relativeX / candleStep)));
    const candle = visibleCandles[idx];
    const price = Number(yToPrice(clickY).toFixed(2));
    const dateStr = candle ? candle.dateStr : new Date().toISOString().split('T')[0];

    const currentPoint = { x: clickX, y: clickY, price, dateStr };

    if (drawingMode === 'HORIZONTAL_LINE' || drawingMode === 'SUPPORT_LINE' || drawingMode === 'RESISTANCE_LINE') {
      const color = drawingMode === 'SUPPORT_LINE' ? '#ef4444' : drawingMode === 'RESISTANCE_LINE' ? '#10b981' : '#38bdf8';
      const newDrawing: UserDrawing = {
        id: `draw_${Date.now()}`,
        symbol,
        type: drawingMode,
        color,
        points: [currentPoint],
        createdAt: new Date().toISOString()
      };
      const updated = [...userDrawings, newDrawing];
      setUserDrawings(updated);
      localStorage.setItem(`bist_drawings_${symbol}`, JSON.stringify(updated));
    } else if (drawingMode === 'TREND_LINE' || drawingMode === 'PARALLEL_CHANNEL') {
      if (drawingInProgress.length === 0) {
        setDrawingInProgress([currentPoint]);
      } else {
        const firstPoint = drawingInProgress[0];
        const color = drawingMode === 'PARALLEL_CHANNEL' ? '#a855f7' : '#f59e0b';
        const newDrawing: UserDrawing = {
          id: `draw_${Date.now()}`,
          symbol,
          type: drawingMode,
          color,
          points: [firstPoint, currentPoint],
          createdAt: new Date().toISOString()
        };
        const updated = [...userDrawings, newDrawing];
        setUserDrawings(updated);
        localStorage.setItem(`bist_drawings_${symbol}`, JSON.stringify(updated));
        setDrawingInProgress([]);
      }
    }
  };

  const activeCandle = hoverIndex !== null && visibleCandles[hoverIndex]
    ? visibleCandles[hoverIndex]
    : visibleCandles[visibleCandles.length - 1];

  const candleChangePct = activeCandle && activeCandle.open > 0
    ? Number((((activeCandle.close - activeCandle.open) / activeCandle.open) * 100).toFixed(2))
    : 0;

  // Subplot scaling
  const maxVol = useMemo(() => {
    return Math.max(...visibleCandles.map(c => c.volume), 1);
  }, [visibleCandles]);

  // Horizontal Grid Price lines
  const gridPrices = useMemo(() => {
    const range = maxPrice - minPrice;
    if (range <= 0) return [];
    const step = range / 5;
    return [0, 1, 2, 3, 4, 5].map(i => minPrice + i * step);
  }, [minPrice, maxPrice]);

  const windowStartDate = visibleCandles[0]?.dateStr || '-';
  const windowEndDate = visibleCandles[visibleCandles.length - 1]?.dateStr || '-';
  const fullDataStartDate = candles[0]?.dateStr || '-';
  const fullDataEndDate = candles[candles.length - 1]?.dateStr || '-';

  return (
    <div
      ref={containerRef}
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-[100] bg-slate-950 p-4 overflow-y-auto flex flex-col justify-between'
          : 'bg-slate-900 border border-slate-800 rounded-lg p-4'
      } select-none transition-all`}
    >
      {/* Top Bar: Active Candle Stats, Timeframe Switcher & Fullscreen Toggle (Kural 8) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        {/* Real-time OHLCV Bar Info */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span className="font-bold text-slate-100 text-sm">{symbol}</span>
          <span className="text-slate-400 font-sans bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            {activeCandle?.dateStr || '-'}
          </span>
          {activeCandle && activeCandle.isClosed === false && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/80 font-mono font-bold animate-pulse">
              AÇIK MUM
            </span>
          )}
          <span>A: <strong className="text-slate-200">{activeCandle?.open?.toFixed(2) || '-'}</strong></span>
          <span>Y: <strong className="text-emerald-400">{activeCandle?.high?.toFixed(2) || '-'}</strong></span>
          <span>D: <strong className="text-rose-400">{activeCandle?.low?.toFixed(2) || '-'}</strong></span>
          <span>K: <strong className={candleChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {activeCandle?.close?.toFixed(2) || '-'}
          </strong></span>
          <span>Fark: <strong className={candleChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {candleChangePct >= 0 ? `+${candleChangePct}%` : `${candleChangePct}%`}
          </strong></span>
          <span>Hacim: <strong className="text-slate-300">
            {activeCandle?.volume ? (activeCandle.volume / 1000).toFixed(0) + 'K' : '-'}
          </strong></span>
        </div>

        {/* Right Side: Timeframe selector tabs + Fullscreen Toggle Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800 text-xs font-medium">
            {[
              { id: '1h', label: '1S' },
              { id: '4h', label: '4S' },
              { id: '1d', label: 'Gün' },
              { id: '1w', label: 'Hafta' },
              { id: '1mo', label: 'Ay' }
            ].map(tf => (
              <button
                key={tf.id}
                onClick={() => onTimeframeChange(tf.id)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  timeframe === tf.id
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Kural 8: Tam Ekran (Fullscreen) Modu Butonu */}
          <button
            onClick={toggleFullscreen}
            className={`px-3 py-1.5 rounded-md border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isFullscreen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-slate-950 text-emerald-400 border-emerald-500/40 hover:bg-emerald-950/50 hover:border-emerald-400'
            }`}
            title={isFullscreen ? 'Tam Ekrandan Çık (ESC)' : 'Analiz Grafiğini Tam Ekran Yap'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                Tam Ekrandan Çık
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                Tam Ekran
              </>
            )}
          </button>
        </div>
      </div>

      {/* Control Bar: EMA Toggles, Historical S/R, 10Y/5Y/1Y/1M White Resistance Intersections, Patterns & Subplots */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 text-xs text-slate-400 border-b border-slate-800/80 pb-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200" title="Kısa Vadeli Trend Yönü">
            <input
              type="checkbox"
              checked={showEma5}
              onChange={e => setShowEma5(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
            />
            <span className="text-amber-400 font-semibold font-mono">EMA 5</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200" title="Ana Trend Göstergesi">
            <input
              type="checkbox"
              checked={showEma20}
              onChange={e => setShowEma20(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span className="text-cyan-400 font-semibold font-mono">EMA 20</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
            <input
              type="checkbox"
              checked={showEma50}
              onChange={e => setShowEma50(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-0"
            />
            <span className="text-purple-400 font-mono">EMA 50</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
            <input
              type="checkbox"
              checked={showEma200}
              onChange={e => setShowEma200(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-pink-500 focus:ring-0"
            />
            <span className="text-pink-400 font-mono">EMA 200</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
            <input
              type="checkbox"
              checked={showBollinger}
              onChange={e => setShowBollinger(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span className="text-emerald-400">Bollinger</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200" title="Tüm Tarihsel Destek, Direnç ve Rol Değişimi (S-R Flip) Seviyeleri">
            <input
              type="checkbox"
              checked={showZones}
              onChange={e => setShowZones(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-rose-500 focus:ring-0"
            />
            <span className="text-slate-300">
              <strong className="text-rose-400 font-medium">Tarihsel Destek</strong> / <strong className="text-emerald-400 font-medium">Direnç</strong> / <strong className="text-sky-400 font-medium">S-R Flip</strong>
            </span>
          </label>
          {/* Kural 4: Mevcut MTF (Beyaz) Kaldırıldı -> 10Y, 5Y, 1Y, 1A Direnç Kesişim Noktaları (Beyaz #FFFFFF) */}
          <label
            className="flex items-center gap-1 cursor-pointer hover:text-slate-200 bg-slate-950/90 px-2 py-0.5 rounded border border-white/30"
            title="10 Yıllık, 5 Yıllık, 1 Yıllık ve 1 Aylık Periyotların Direnç Kesişim Noktaları (Beyaz #FFFFFF)"
          >
            <input
              type="checkbox"
              checked={showMtf}
              onChange={e => setShowMtf(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-white focus:ring-0"
            />
            <span className="text-white font-bold flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-white inline-block" /> 10Y/5Y/1Y/1A Direnç Kesişimi (Beyaz)
            </span>
          </label>
          {/* Kural 5: Otomatik Formasyon Tarayıcı (TOBO, OBO, Çift Dip/Tepe, Üçgen, Kama, Bayrak, Flama, Fincan-Kulp, Harmonik) */}
          <label
            className="flex items-center gap-1 cursor-pointer hover:text-slate-200 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/30"
            title="Otomatik Formasyon Tarayıcı (TOBO, OBO, Çift Dip/Tepe, Üçgen, Kama, Bayrak, Flama, Fincan-Kulp, Harmonik)"
          >
            <input
              type="checkbox"
              checked={showPatterns}
              onChange={e => setShowPatterns(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-amber-400 focus:ring-0"
            />
            <span className="text-amber-300 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Otomatik Formasyonlar ({activeChartPatterns.length})
            </span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
            <input
              type="checkbox"
              checked={showAutoChannels}
              onChange={e => setShowAutoChannels(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-0"
            />
            <span className="text-purple-400">Kanallar</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200" title="Fibonacci Düzeltme ve Uzatma Seviyeleri">
            <input
              type="checkbox"
              checked={showFib}
              onChange={e => setShowFib(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-400 focus:ring-0"
            />
            <span className="text-sky-400 font-semibold font-mono">Fibonacci</span>
          </label>
        </div>

        {/* Subplot selector tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
          <button
            onClick={() => setActiveSubplot('VOLUME')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              activeSubplot === 'VOLUME' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Hacim (EMA 20)
          </button>
          <button
            onClick={() => setActiveSubplot('RSI')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              activeSubplot === 'RSI' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            RSI (14)
          </button>
          <button
            onClick={() => setActiveSubplot('MACD')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              activeSubplot === 'MACD' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MACD
          </button>
        </div>
      </div>

      {/* Kural 7: 5 Yıllık Veri Gezinme (Pan / Scroll & Zoom) Kontrol Çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 pb-1.5 border-b border-slate-800/70 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <MoveHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            5 Yıllık Grafik Kaydırma &amp; Pencere:
          </span>
          {[
            { bars: 65, label: '3 Ay' },
            { bars: 130, label: '6 Ay' },
            { bars: 252, label: '1 Yıl' },
            { bars: 750, label: '3 Yıl' },
            { bars: Math.max(1250, candles.length), label: '5 Yıl (Tümü)' }
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => {
                setZoomLevel(Math.min(candles.length || preset.bars, preset.bars));
                if (preset.bars >= candles.length) setPanOffset(0);
              }}
              className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                Math.abs(zoomLevel - Math.min(candles.length || preset.bars, preset.bars)) <= 10
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={handleZoomIn}
            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-0.5"
            title="Yakınlaştır (Zoom In)"
          >
            <ZoomIn className="w-3 h-3 text-cyan-400" /> +
          </button>
          <button
            onClick={handleZoomOut}
            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-0.5"
            title="Uzaklaştır (Zoom Out)"
          >
            <ZoomOut className="w-3 h-3 text-cyan-400" /> -
          </button>
        </div>

        {/* Timeline Scrubber & Step Pan Buttons */}
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl justify-end">
          <button
            onClick={() => setPanOffset(prev => Math.min(maxPanOffset, prev + Math.max(15, Math.round(zoomLevel * 0.35))))}
            disabled={effectivePanOffset >= maxPanOffset}
            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 flex items-center gap-0.5 font-mono text-[10px]"
            title="Geçmiş Tarihlere Kaydır"
          >
            <ChevronLeft className="w-3 h-3" /> Geçmişe
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <span className="text-[10px] font-mono text-slate-500">{fullDataStartDate}</span>
            <input
              type="range"
              min={0}
              max={maxPanOffset}
              value={maxPanOffset - effectivePanOffset}
              onChange={e => {
                const val = Number(e.target.value);
                setPanOffset(Math.max(0, maxPanOffset - val));
              }}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              title="5 Yıllık Tarihsel Zaman Çizelgesinde Kaydır"
            />
            <span className="text-[10px] font-mono text-slate-500">{fullDataEndDate}</span>
          </div>

          <button
            onClick={() => setPanOffset(prev => Math.max(0, prev - Math.max(15, Math.round(zoomLevel * 0.35))))}
            disabled={effectivePanOffset === 0}
            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 flex items-center gap-0.5 font-mono text-[10px]"
            title="Günümüze Doğru Kaydır"
          >
            İleri <ChevronRight className="w-3 h-3" />
          </button>

          {effectivePanOffset > 0 && (
            <button
              onClick={() => setPanOffset(0)}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold font-mono text-[10px]"
            >
              Bugüne Dön
            </button>
          )}
        </div>
      </div>

      {/* User Interactive Drawing Toolbar (Madde 9: Kullanıcı Çizimleri) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            Çizim / Kaydırma Modu:
          </span>
          {[
            { id: 'NONE', label: 'Fare İle Sürükle & İncele (Pan)' },
            { id: 'TREND_LINE', label: 'Trend Çizgisi' },
            { id: 'HORIZONTAL_LINE', label: 'Yatay Çizgi' },
            { id: 'SUPPORT_LINE', label: 'Destek (Kırmızı)' },
            { id: 'RESISTANCE_LINE', label: 'Direnç (Yeşil)' },
            { id: 'PARALLEL_CHANNEL', label: 'Kanal Çizgisi' }
          ].map(tool => (
            <button
              key={tool.id}
              onClick={() => {
                setDrawingMode(tool.id as DrawingMode);
                setDrawingInProgress([]);
              }}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                drawingMode === tool.id
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {tool.label}
            </button>
          ))}
          {drawingInProgress.length > 0 && (
            <span className="text-[10px] text-amber-400 font-mono animate-pulse">
              1. Nokta seçildi. Bitiş için 2. noktaya tıklayın...
            </span>
          )}
        </div>

        {/* Visible Date Range Badge + Drawing Actions */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            Görünüm: <strong className="text-emerald-400">{windowStartDate}</strong> → <strong className="text-emerald-400">{windowEndDate}</strong> ({visibleCandles.length} / {candles.length} Mum)
          </span>
          {userDrawings.length > 0 && (
            <button
              onClick={handleUndoDrawing}
              className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Son çizimi geri al"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {userDrawings.length > 0 && (
            <button
              onClick={handleClearDrawings}
              className="p-1 rounded bg-slate-950 border border-slate-800 text-rose-400 hover:text-rose-300 transition-colors"
              title="Tüm kullanıcı çizimlerini temizle"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleSaveDrawings}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
          >
            {saveSuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
            {saveSuccess ? 'Kaydedildi' : `Kaydet (${userDrawings.length})`}
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-hidden mt-2 bg-slate-950 rounded border border-slate-800/80 flex-1">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center z-20">
            <div className="text-xs text-emerald-400 font-mono animate-pulse">Grafik verisi yükleniyor...</div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${mainHeight + subHeight}`}
          className={`w-full h-auto block ${
            drawingMode !== 'NONE'
              ? 'cursor-crosshair'
              : isDraggingPan
              ? 'cursor-grabbing'
              : 'cursor-grab'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
        >
          <defs>
            <linearGradient id="bbGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="channelGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* MAIN PRICE PANEL */}
          {/* Background grid lines */}
          {gridPrices.map((price, i) => {
            const y = priceToY(price);
            return (
              <g key={`grid_${i}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={chartWidth - paddingRight + 6}
                  y={y + 3}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="JetBrains Mono"
                  textAnchor="start"
                >
                  {price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Kural 2 & Kural 3: Tarihsel Destek / Direnç Seviyeleri ve Destek-Direnç Dönüşümleri (Rol Değişimi / S-R Flip) */}
          {showZones && zones.map((zone, idx) => {
            const levelPrice = zone.price ?? zone.pivotPrice;
            const yMid = priceToY(levelPrice);
            if (yMid < paddingTop || yMid > mainHeight - paddingBottom) return null;

            const isSupp = (zone.type && (zone.type.toUpperCase() === 'SUPPORT' || zone.type.toLowerCase() === 'support')) || zone.colorHex === '#ef4444';
            const isFlippedSupport = zone.status === 'flipped_support' || zone.roleReversalType === 'RESISTANCE_TO_SUPPORT';
            const isFlippedResistance = zone.status === 'flipped_resistance' || zone.roleReversalType === 'SUPPORT_TO_RESISTANCE';
            const isPendingFlip = zone.status === 'pending_flip' || zone.roleReversal === 'PENDING_CONFIRMATION';
            const isBroken = zone.status === 'broken' || zone.status === 'BROKEN';
            const isRetest = zone.status === 'retest';

            let strokeColor = isSupp ? '#ef4444' : '#10b981';
            let badgeBg = isSupp ? '#7f1d1d' : '#064e3b';
            let badgeBorder = isSupp ? '#dc2626' : '#059669';
            let textColor = isSupp ? '#fecaca' : '#a7f3d0';
            let labelPrefix = isSupp ? 'D' : 'R';
            let flipBannerText: string | null = null;

            if (isFlippedSupport) {
              strokeColor = '#38bdf8'; // Açık mavi (Destekleşen Direnç / S-R Flip)
              badgeBg = '#0c4a6e';
              badgeBorder = '#0284c7';
              textColor = '#e0f2fe';
              labelPrefix = 'D-FLIP';
              flipBannerText = `ROL DEĞİŞİMİ (S-R Flip): Kırılan Direnç → Yeni Destek (${levelPrice.toFixed(2)} TL)`;
            } else if (isFlippedResistance) {
              strokeColor = '#f97316'; // Turuncu (Dirençleşen Destek / S-R Flip)
              badgeBg = '#7c2d12';
              badgeBorder = '#ea580c';
              textColor = '#ffedd5';
              labelPrefix = 'R-FLIP';
              flipBannerText = `ROL DEĞİŞİMİ (S-R Flip): Kırılan Destek → Yeni Direnç (${levelPrice.toFixed(2)} TL)`;
            } else if (isPendingFlip) {
              strokeColor = '#eab308';
              badgeBg = '#713f12';
              badgeBorder = '#ca8a04';
              textColor = '#fef08a';
              labelPrefix = 'S-R Teyit';
            }

            const lowVal = zone.zoneLow ?? zone.priceLow;
            const highVal = zone.zoneHigh ?? zone.priceHigh;
            let bandTop: number | null = null;
            let bandHeight: number | null = null;
            if (lowVal && highVal && lowVal !== highVal) {
              const yHigh = priceToY(Math.max(lowVal, highVal));
              const yLow = priceToY(Math.min(lowVal, highVal));
              bandTop = Math.min(yHigh, yLow);
              bandHeight = Math.max(3, Math.abs(yLow - yHigh));
            }

            const histFormationDate = zone.formationDate || zone.firstObservedAt;

            return (
              <g
                key={`zone_${idx}`}
                className="cursor-pointer group"
                onClick={() => {
                  setSelectedLevelModal(zone);
                  onSelectLevel?.(zone);
                }}
              >
                <title>{`${labelPrefix}: ${levelPrice.toFixed(2)} TL | Tarihsel Oluşum: ${histFormationDate || '-'} | Durum: ${zone.status} | Güç: ${zone.strengthScore}/100`}</title>
                {bandTop !== null && bandHeight !== null && (
                  <rect
                    x={paddingLeft}
                    y={bandTop}
                    width={chartWidth - paddingLeft - paddingRight}
                    height={bandHeight}
                    fill={strokeColor}
                    opacity="0.08"
                    pointerEvents="none"
                  />
                )}
                <line
                  x1={paddingLeft}
                  y1={yMid}
                  x2={chartWidth - paddingRight}
                  y2={yMid}
                  stroke={strokeColor}
                  strokeWidth={isFlippedSupport || isFlippedResistance ? '2.1' : zone.strengthScore > 75 ? '1.9' : '1.3'}
                  strokeDasharray={isBroken ? '3 3' : isRetest ? '5 2' : zone.strengthScore > 65 ? 'none' : '4 3'}
                  opacity={isBroken ? 0.5 : 0.92}
                />
                {/* S-R Flip veya Tarihsel Seviye Etiketi */}
                {(flipBannerText || histFormationDate) && (
                  <text
                    x={paddingLeft + 6}
                    y={yMid - 4}
                    fill={strokeColor}
                    fontSize="8.5"
                    fontFamily="JetBrains Mono"
                    fontWeight="700"
                    opacity={isBroken ? 0.65 : 0.95}
                  >
                    {flipBannerText
                      ? flipBannerText
                      : `${isSupp ? 'Tarihsel Destek' : 'Tarihsel Direnç'} (${histFormationDate}) · ${zone.touchCount || 2} Temas`}
                  </text>
                )}
                {/* Sağ Fiyat Ekseni Rozeti */}
                <rect
                  x={chartWidth - paddingRight + 3}
                  y={yMid - 7.5}
                  width="76"
                  height="15"
                  fill={badgeBg}
                  stroke={badgeBorder}
                  strokeWidth="0.9"
                  rx="2"
                />
                <text
                  x={chartWidth - paddingRight + 5}
                  y={yMid + 3.5}
                  fill={textColor}
                  fontSize="7.5"
                  fontFamily="JetBrains Mono"
                  fontWeight="700"
                >
                  {labelPrefix}: {levelPrice.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Kural 4: 10 YILLIK, 5 YILLIK, 1 YILLIK VE 1 AYLIK DİRENÇ KESİŞİM NOKTALARI (BEYAZ #FFFFFF) */}
          {showMtf && mtfConfluences && mtfConfluences.map((mtf, idx) => {
            const y = priceToY(mtf.price);
            if (y < paddingTop || y > mainHeight - paddingBottom) return null;
            const periodsText = mtf.timeframes.map(t => t.toUpperCase()).join('+');
            return (
              <g
                key={`mtf_${idx}`}
                className="cursor-pointer group"
                onClick={() => {
                  setSelectedLevelModal(mtf);
                  onSelectLevel?.(mtf);
                }}
              >
                <title>{`Çoklu Zaman Dilimi Direnç Kesişimi (Beyaz #FFFFFF): ${mtf.price.toFixed(2)} TL | Periyotlar: ${periodsText} | Güç: ${mtf.strengthScore}/100`}</title>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#ffffff"
                  strokeWidth="2.3"
                  strokeDasharray="7 3"
                  opacity="0.96"
                />
                {/* Beyaz Kesişim Elmas İkonu ve Etiketi */}
                <polygon
                  points={`${paddingLeft + 14},${y - 5} ${paddingLeft + 19},${y} ${paddingLeft + 14},${y + 5} ${paddingLeft + 9},${y}`}
                  fill="#ffffff"
                  stroke="#020617"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft + 24}
                  y={y - 4}
                  fill="#ffffff"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono"
                  fontWeight="800"
                >
                  ◆ DİRENÇ KESİŞİMİ ({periodsText}): {mtf.price.toFixed(2)} TL
                </text>
                <rect
                  x={chartWidth - paddingRight + 3}
                  y={y - 8}
                  width="76"
                  height="16"
                  fill="#020617"
                  stroke="#ffffff"
                  strokeWidth="1.3"
                  rx="2"
                />
                <text
                  x={chartWidth - paddingRight + 5}
                  y={y + 3.5}
                  fill="#ffffff"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono"
                  fontWeight="800"
                >
                  KESİŞİM: {mtf.price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* FIBONACCI RETRACEMENT & EXTENSION ÇİZGİLERİ */}
          {showFib && fibonacci && (
            <g key="fibonacci_overlay">
              {[...fibonacci.retracements, ...fibonacci.extensions].map((fl, fIdx) => {
                const y = priceToY(fl.price);
                if (y < paddingTop || y > mainHeight - paddingBottom) return null;
                const isExt = fl.type === 'EXTENSION';
                const strokeColor = isExt ? '#c084fc' : '#38bdf8';
                return (
                  <g
                    key={`fib_${fIdx}`}
                    className="cursor-pointer group"
                    onClick={() => {
                      setSelectedLevelModal(fl);
                      onSelectLevel?.(fl);
                    }}
                  >
                    <title>{`${fl.label}: ${fl.price.toFixed(2)} TL (${fl.type === 'RETRACEMENT' ? 'Düzeltme' : 'Uzatma'})`}</title>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartWidth - paddingRight}
                      y2={y}
                      stroke={strokeColor}
                      strokeWidth="1.2"
                      strokeDasharray={isExt ? '3 3' : '4 2'}
                      opacity="0.75"
                    />
                    <rect
                      x={chartWidth - paddingRight + 3}
                      y={y - 7}
                      width="76"
                      height="14"
                      fill="#030712"
                      stroke={strokeColor}
                      strokeWidth="0.8"
                      rx="2"
                    />
                    <text
                      x={chartWidth - paddingRight + 5}
                      y={y + 3}
                      fill={strokeColor}
                      fontSize="7.5"
                      fontFamily="JetBrains Mono"
                      fontWeight="700"
                    >
                      {fl.ratioFormatted}: {fl.price.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Otomatik Kanallar */}
          {showAutoChannels && channels.map((ch, idx) => {
            const yStartUpper = priceToY(ch.upperPriceNow - ch.slope * (candleCount - 1));
            const yEndUpper = priceToY(ch.upperPriceNow);
            const yStartLower = priceToY(ch.lowerPriceNow - ch.slope * (candleCount - 1));
            const yEndLower = priceToY(ch.lowerPriceNow);
            const xStart = getCandleX(0);
            const xEnd = getCandleX(candleCount - 1);

            return (
              <g key={`autoch_${idx}`}>
                <polygon
                  points={`${xStart},${yStartUpper} ${xEnd},${yEndUpper} ${xEnd},${yEndLower} ${xStart},${yStartLower}`}
                  fill="url(#channelGradient)"
                />
                <line
                  x1={xStart}
                  y1={yStartUpper}
                  x2={xEnd}
                  y2={yEndUpper}
                  stroke="#a855f7"
                  strokeWidth="1.4"
                  strokeDasharray="4 2"
                />
                <line
                  x1={xStart}
                  y1={yStartLower}
                  x2={xEnd}
                  y2={yEndLower}
                  stroke="#a855f7"
                  strokeWidth="1.4"
                  strokeDasharray="4 2"
                />
              </g>
            );
          })}

          {/* Kural 5: OTOMATİK FORMASYON ÇİZİM MOTORU (TOBO, OBO, Çift Dip/Tepe, Üçgen, Kama, Bayrak, Flama, Fincan-Kulp, Harmonik) */}
          {showPatterns && activeChartPatterns.map((pat, pIdx) => {
            const isBull = pat.bias === 'BULLISH';
            const patColor = isBull ? '#fbbf24' : '#f43f5e';
            const validPoints = (pat.keyPoints || [])
              .map(kp => {
                const localIdx = kp.barIndex - startIdx;
                if (localIdx < 0 || localIdx >= candleCount) return null;
                return {
                  ...kp,
                  x: getCandleX(localIdx),
                  y: priceToY(kp.price)
                };
              })
              .filter(Boolean) as { label: string; price: number; dateStr: string; barIndex: number; x: number; y: number }[];

            if (validPoints.length < 2) return null;

            const polylineStr = validPoints.map(vp => `${vp.x},${vp.y}`).join(' ');
            const firstPt = validPoints[0];
            const lastPt = validPoints[validPoints.length - 1];
            const necklineY = pat.necklinePrice ? priceToY(pat.necklinePrice) : null;
            const targetY = pat.targetPrice ? priceToY(pat.targetPrice) : null;

            return (
              <g key={`chart_pat_${pat.id}_${pIdx}`}>
                {/* Formasyon Geometri Çizgisi */}
                <polyline
                  points={polylineStr}
                  fill="none"
                  stroke={patColor}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  opacity="0.95"
                />
                {/* Boyun Çizgisi (Neckline) */}
                {necklineY !== null && necklineY >= paddingTop && necklineY <= mainHeight - paddingBottom && (
                  <line
                    x1={firstPt.x}
                    y1={necklineY}
                    x2={Math.min(chartWidth - paddingRight, lastPt.x + 35)}
                    y2={necklineY}
                    stroke={patColor}
                    strokeWidth="1.3"
                    strokeDasharray="5 3"
                    opacity="0.85"
                  />
                )}
                {/* Hedef Fiyat Projeksiyon Ok Çizgisi */}
                {targetY !== null && targetY >= paddingTop && targetY <= mainHeight - paddingBottom && (
                  <g>
                    <line
                      x1={lastPt.x}
                      y1={lastPt.y}
                      x2={Math.min(chartWidth - paddingRight - 8, lastPt.x + 24)}
                      y2={targetY}
                      stroke={isBull ? '#10b981' : '#f43f5e'}
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  </g>
                )}
                {/* Formasyon Köşe Noktaları ve Etiketleri */}
                {validPoints.map((vp, vpIdx) => (
                  <g key={`pat_pt_${pIdx}_${vpIdx}`}>
                    <circle
                      cx={vp.x}
                      cy={vp.y}
                      r="3.5"
                      fill="#020617"
                      stroke={patColor}
                      strokeWidth="2"
                    />
                    <text
                      x={vp.x}
                      y={vp.y - 7}
                      fill={patColor}
                      fontSize="8"
                      fontFamily="JetBrains Mono"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {vp.label}
                    </text>
                  </g>
                ))}
                {/* Formasyon Ana İsim ve Hedef Etiketi */}
                <g transform={`translate(${Math.max(paddingLeft + 10, Math.min(chartWidth - paddingRight - 220, (firstPt.x + lastPt.x) / 2 - 90))}, ${Math.max(paddingTop + 6, Math.min(mainHeight - 40, firstPt.y - 28))})`}>
                  <rect
                    x="0"
                    y="0"
                    width="210"
                    height="20"
                    rx="4"
                    fill="#020617"
                    stroke={patColor}
                    strokeWidth="1.2"
                    opacity="0.92"
                  />
                  <text
                    x="105"
                    y="13"
                    fill={patColor}
                    fontSize="8.5"
                    fontFamily="JetBrains Mono"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    ★ {pat.turkishName} → Hedef: {pat.targetPrice.toFixed(2)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* User Drawings Layer */}
          {userDrawings.map((draw) => {
            if (draw.type === 'HORIZONTAL_LINE' || draw.type === 'SUPPORT_LINE' || draw.type === 'RESISTANCE_LINE') {
              const pt = draw.points[0];
              const y = priceToY(pt.price);
              return (
                <g key={draw.id} className="group cursor-pointer">
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke={draw.color}
                    strokeWidth="1.8"
                    strokeDasharray={draw.type === 'HORIZONTAL_LINE' ? '5 3' : 'none'}
                  />
                  <rect
                    x={paddingLeft + 4}
                    y={y - 8}
                    width="62"
                    height="16"
                    fill="#0f172a"
                    stroke={draw.color}
                    strokeWidth="1"
                    rx="2"
                  />
                  <text
                    x={paddingLeft + 8}
                    y={y + 4}
                    fill={draw.color}
                    fontSize="9"
                    fontFamily="JetBrains Mono"
                    fontWeight="700"
                  >
                    {draw.points[0].price.toFixed(2)} TL
                  </text>
                </g>
              );
            } else if (draw.type === 'TREND_LINE' || draw.type === 'PARALLEL_CHANNEL') {
              if (draw.points.length < 2) return null;
              const pt1 = draw.points[0];
              const pt2 = draw.points[1];
              const y1 = priceToY(pt1.price);
              const y2 = priceToY(pt2.price);
              const x1 = pt1.x || getCandleX(0);
              const x2 = pt2.x || getCandleX(candleCount - 1);

              return (
                <g key={draw.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={draw.color}
                    strokeWidth="2"
                  />
                  {draw.type === 'PARALLEL_CHANNEL' && (
                    <line
                      x1={x1}
                      y1={y1 + 25}
                      x2={x2}
                      y2={y2 + 25}
                      stroke={draw.color}
                      strokeWidth="1.6"
                      strokeDasharray="4 2"
                      opacity={0.8}
                    />
                  )}
                </g>
              );
            }
            return null;
          })}

          {drawingInProgress.length === 1 && (
            <circle
              cx={drawingInProgress[0].x}
              cy={drawingInProgress[0].y}
              r="4"
              fill="#38bdf8"
              className="animate-ping"
            />
          )}

          {/* Bollinger Bands Fill */}
          {showBollinger && (
            <path
              d={(() => {
                let dUpper = '';
                let dLower = '';
                for (let i = 0; i < candleCount; i++) {
                  const u = bbSeries.upper[i];
                  const l = bbSeries.lower[i];
                  if (u !== null && l !== null) {
                    const x = getCandleX(i);
                    const yU = priceToY(u);
                    const yL = priceToY(l);
                    if (!dUpper) dUpper = `M ${x} ${yU}`;
                    else dUpper += ` L ${x} ${yU}`;
                    if (!dLower) dLower = `L ${x} ${yL}`;
                    else dLower = `L ${x} ${yL} ` + dLower;
                  }
                }
                return dUpper ? `${dUpper} ${dLower} Z` : '';
              })()}
              fill="url(#bbGradient)"
            />
          )}

          {/* Bollinger Lines */}
          {showBollinger && (
            <>
              <path
                d={bbSeries.upper.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity={0.5}
              />
              <path
                d={bbSeries.middle.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity={0.6}
              />
              <path
                d={bbSeries.lower.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity={0.5}
              />
            </>
          )}

          {/* EMA Curves */}
          {showEma5 && (
            <path
              d={ema5Series.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.6"
            />
          )}
          {showEma20 && (
            <path
              d={ema20Series.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="1.6"
            />
          )}
          {showEma50 && (
            <path
              d={ema50Series.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
              fill="none"
              stroke="#a855f7"
              strokeWidth="1.4"
            />
          )}
          {showEma200 && (
            <path
              d={ema200Series.map((val, i) => val !== null ? `${i === 0 ? 'M' : 'L'} ${getCandleX(i)} ${priceToY(val)}` : '').filter(Boolean).join(' ')}
              fill="none"
              stroke="#ec4899"
              strokeWidth="1.4"
            />
          )}

          {/* Candlesticks */}
          {visibleCandles.map((c, i) => {
            const x = getCandleX(i);
            const isBullish = c.close >= c.open;
            const candleColor = isBullish ? '#10b981' : '#f43f5e';

            const yHigh = priceToY(c.high);
            const yLow = priceToY(c.low);
            const yOpen = priceToY(c.open);
            const yClose = priceToY(c.close);

            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));

            return (
              <g key={`candle_${i}`}>
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={candleColor}
                  strokeWidth="1.2"
                />
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={candleColor}
                  stroke={candleColor}
                  strokeWidth="0.5"
                  rx="0.5"
                />
              </g>
            );
          })}

          {/* Separator between main and subplot */}
          <line
            x1={paddingLeft}
            y1={mainHeight}
            x2={chartWidth - paddingRight}
            y2={mainHeight}
            stroke="#334155"
            strokeWidth="1"
          />

          {/* SUBPLOT PANEL */}
          {activeSubplot === 'VOLUME' && (
            <g transform={`translate(0, ${mainHeight})`}>
              <text x={paddingLeft + 4} y="14" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono">
                HACİM (20 GÜNLÜK EMA HACİM)
              </text>
              {visibleCandles.map((c, i) => {
                const x = getCandleX(i);
                const isBull = c.close >= c.open;
                const barHeight = (c.volume / maxVol) * (subHeight - 25);
                const y = subHeight - barHeight;

                return (
                  <rect
                    key={`vol_${i}`}
                    x={x - candleWidth / 2}
                    y={y}
                    width={candleWidth}
                    height={Math.max(1, barHeight)}
                    fill={isBull ? '#065f46' : '#881337'}
                    opacity={0.8}
                  />
                );
              })}
              <path
                d={volumeEmaSeries.map((v, i) => {
                  if (v === null) return '';
                  const x = getCandleX(i);
                  const y = subHeight - (v / maxVol) * (subHeight - 25);
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).filter(Boolean).join(' ')}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.2"
              />
            </g>
          )}

          {activeSubplot === 'RSI' && (
            <g transform={`translate(0, ${mainHeight})`}>
              <line
                x1={paddingLeft}
                y1={subHeight * 0.3}
                x2={chartWidth - paddingRight}
                y2={subHeight * 0.3}
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity={0.6}
              />
              <text x={chartWidth - paddingRight + 4} y={subHeight * 0.3 + 3} fill="#f43f5e" fontSize="9" fontFamily="JetBrains Mono">70</text>

              <line
                x1={paddingLeft}
                y1={subHeight * 0.7}
                x2={chartWidth - paddingRight}
                y2={subHeight * 0.7}
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity={0.6}
              />
              <text x={chartWidth - paddingRight + 4} y={subHeight * 0.7 + 3} fill="#10b981" fontSize="9" fontFamily="JetBrains Mono">30</text>

              <path
                d={rsiSeries.map((v, i) => {
                  if (v === null) return '';
                  const x = getCandleX(i);
                  const y = (1 - v / 100) * subHeight;
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).filter(Boolean).join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
              <text x={paddingLeft + 4} y="14" fill="#38bdf8" fontSize="9" fontFamily="JetBrains Mono">
                RSI 14: {rsiSeries[rsiSeries.length - 1] || '-'}
              </text>
            </g>
          )}

          {activeSubplot === 'MACD' && (
            <g transform={`translate(0, ${mainHeight})`}>
              <line
                x1={paddingLeft}
                y1={subHeight / 2}
                x2={chartWidth - paddingRight}
                y2={subHeight / 2}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {macdSeries.histogram.map((h, i) => {
                if (h === null) return null;
                const x = getCandleX(i);
                const zeroY = subHeight / 2;
                const scaledH = Math.max(-subHeight / 2 + 5, Math.min(subHeight / 2 - 5, h * 12));
                const y = scaledH > 0 ? zeroY - scaledH : zeroY;

                return (
                  <rect
                    key={`hist_${i}`}
                    x={x - candleWidth / 2}
                    y={y}
                    width={candleWidth}
                    height={Math.max(1, Math.abs(scaledH))}
                    fill={scaledH >= 0 ? '#10b981' : '#f43f5e'}
                    opacity={0.75}
                  />
                );
              })}
              <path
                d={macdSeries.macdLine.map((v, i) => {
                  if (v === null) return '';
                  const x = getCandleX(i);
                  const y = subHeight / 2 - v * 12;
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).filter(Boolean).join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.4"
              />
              <path
                d={macdSeries.signalLine.map((v, i) => {
                  if (v === null) return '';
                  const x = getCandleX(i);
                  const y = subHeight / 2 - v * 12;
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).filter(Boolean).join(' ')}
                fill="none"
                stroke="#f97316"
                strokeWidth="1.2"
              />
              <text x={paddingLeft + 4} y="14" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono">
                MACD (12, 26, 9)
              </text>
            </g>
          )}

          {/* CROSSHAIR TRACKER */}
          {hoverIndex !== null && visibleCandles[hoverIndex] && (
            <g>
              <line
                x1={getCandleX(hoverIndex)}
                y1={paddingTop}
                x2={getCandleX(hoverIndex)}
                y2={mainHeight + subHeight}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <line
                x1={paddingLeft}
                y1={priceToY(visibleCandles[hoverIndex].close)}
                x2={chartWidth - paddingRight}
                y2={priceToY(visibleCandles[hoverIndex].close)}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <rect
                x={chartWidth - paddingRight + 2}
                y={priceToY(visibleCandles[hoverIndex].close) - 8}
                width="76"
                height="16"
                fill="#0284c7"
                rx="2"
              />
              <text
                x={chartWidth - paddingRight + 5}
                y={priceToY(visibleCandles[hoverIndex].close) + 3}
                fill="#ffffff"
                fontSize="10"
                fontFamily="JetBrains Mono"
                fontWeight="700"
              >
                {visibleCandles[hoverIndex].close.toFixed(2)}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Bottom disclaimer bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[10px] text-slate-500 font-mono">
        <span>Kapsam: BIST Pay Piyasası · Tarihsel Veri: {fullDataStartDate} — {fullDataEndDate} ({candles.length} Mum)</span>
        <span>Destekler: Kırmızı (#ef4444) · Dirençler: Yeşil (#10b981) · 10Y/5Y/1Y/1A Direnç Kesişimi: Beyaz (#ffffff) · S-R Flip Destek: Mavi (#38bdf8) · S-R Flip Direnç: Turuncu (#f97316)</span>
      </div>

      {/* SEVİYE DETAY MODAL DİYALOĞU (Çizgiye Tıklama İncelemesi) */}
      {selectedLevelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-200 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-sm text-white font-mono">
                  {symbol} Seviye Detayı &amp; Tarihsel Durum
                </h4>
              </div>
              <button
                onClick={() => setSelectedLevelModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {'confluentLevels' in selectedLevelModal ? (
                // MTF Confluence Zone Details
                <div className="space-y-3 font-mono">
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Seviye Türü</span>
                      <strong className="text-white text-sm flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-white inline-block shadow-sm shadow-white" />
                        Çoklu Zaman Dilimi Birleşimi (BEYAZ ÇİZGİ)
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Temsilî Fiyat</span>
                      <strong className="text-white text-base">{selectedLevelModal.price.toFixed(2)} TL</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Birleşen Dönemler</span>
                      <span className="text-emerald-400 font-bold">{selectedLevelModal.timeframes.map(t => t.toUpperCase()).join(' + ')}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Güç Skoru</span>
                      <span className="text-cyan-400 font-bold">{selectedLevelModal.strengthScore}/100</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Kullanılan Tolerans</span>
                      <span className="text-slate-300">±%{selectedLevelModal.tolerancePct}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Birleşen Seviye</span>
                      <span className="text-slate-300">{selectedLevelModal.confluentLevels.length} Seviye</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Veri Kapsamı</span>
                    <span className="text-slate-300">{selectedLevelModal.dataCoverage || 'Tam Kapsam'}</span>
                  </div>

                  <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Açıklama</span>
                    <p className="text-slate-400 font-sans text-xs mt-1">{selectedLevelModal.description}</p>
                  </div>
                </div>
              ) : 'ratio' in selectedLevelModal ? (
                // Fibonacci Level Details
                <div className="space-y-3 font-mono">
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Fibonacci Türü</span>
                      <strong className="text-sky-400 text-sm">
                        {selectedLevelModal.type === 'RETRACEMENT' ? 'Düzeltme (Retracement)' : 'Uzatma (Extension)'} ({selectedLevelModal.ratioFormatted})
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Fiyat Seviyesi</span>
                      <strong className="text-white text-base">{selectedLevelModal.price.toFixed(2)} TL</strong>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase">Oran &amp; Etiket</span>
                    <span className="text-slate-200">{selectedLevelModal.label}</span>
                  </div>

                  <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800 text-[11px] text-slate-400 font-sans">
                    Not: Fibonacci düzeltme ve uzatma seviyeleri olası destek/direnç reaksiyon bölgelerini temsil eder, kesin fiyat dönüş garantisi sunmaz.
                  </div>
                </div>
              ) : (
                // SupportResistanceZone Details
                <div className="space-y-3 font-mono">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Seviye Sınıfı</span>
                      <strong className={`text-sm flex items-center gap-1.5 ${
                        selectedLevelModal.status === 'flipped_support'
                          ? 'text-sky-400'
                          : selectedLevelModal.status === 'flipped_resistance'
                          ? 'text-orange-400'
                          : selectedLevelModal.status === 'pending_flip'
                          ? 'text-amber-400'
                          : selectedLevelModal.type === 'SUPPORT'
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}>
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: selectedLevelModal.colorHex || '#10b981' }}
                        />
                        {selectedLevelModal.status === 'flipped_support'
                          ? 'DİRENÇTEN DÖNÜŞEN YENİ DESTEK'
                          : selectedLevelModal.status === 'flipped_resistance'
                          ? 'DESTEKTEN DÖNÜŞEN YENİ DİRENÇ'
                          : selectedLevelModal.status === 'pending_flip'
                          ? 'TEYİT BEKLEYEN ROL DEĞİŞİMİ'
                          : selectedLevelModal.type === 'SUPPORT'
                          ? 'DESTEK (KIRMIZI)'
                          : 'DİRENÇ (YEŞİL)'}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Fiyat &amp; Koridor</span>
                      <strong className="text-white text-base">{(selectedLevelModal.price ?? selectedLevelModal.pivotPrice)?.toFixed(2)} TL</strong>
                      <span className="text-[10px] text-slate-400 block">
                        {(selectedLevelModal.zoneLow ?? selectedLevelModal.priceLow)?.toFixed(2)} - {(selectedLevelModal.zoneHigh ?? selectedLevelModal.priceHigh)?.toFixed(2)} TL
                      </span>
                    </div>
                  </div>

                  {/* Grid of properties */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Durum (Status)</span>
                      <span className="text-slate-200 font-bold uppercase">{selectedLevelModal.status}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Güç Skoru</span>
                      <span className="text-emerald-400 font-bold">{selectedLevelModal.strengthScore}/100</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Oluşum Tarihi (Formation)</span>
                      <span className="text-slate-300">{selectedLevelModal.formationDate || selectedLevelModal.firstObservedAt || '-'}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Doğrulanma Tarihi (Confirmation)</span>
                      <span className="text-slate-300">{selectedLevelModal.confirmationDate || selectedLevelModal.lastObservedAt || '-'}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Test &amp; Tepki Sayısı</span>
                      <span className="text-slate-200 font-bold">{selectedLevelModal.touchCount} Temas · {selectedLevelModal.bounceCount || 0} Tepki</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase">Fiyata Uzaklık</span>
                      <span className="text-slate-300">%{selectedLevelModal.distancePercent?.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Breakout and Role Reversal info */}
                  <div className="p-3 bg-slate-950/70 rounded border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase">Kırılım Tarihi:</span>
                      <span className="text-slate-300 font-bold">{selectedLevelModal.breakoutDate || selectedLevelModal.breakoutAt || 'Kırılmadı'}</span>
                    </div>
                    {selectedLevelModal.breakoutClose && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[10px] uppercase">Kırılım Kapanışı:</span>
                        <span className="text-slate-300">{selectedLevelModal.breakoutClose.toFixed(2)} TL</span>
                      </div>
                    )}
                    {selectedLevelModal.breakoutVolumeRatio && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-[10px] uppercase">Kırılım Hacim Oranı:</span>
                        <span className={`font-bold ${selectedLevelModal.breakoutVolumeRatio >= 1.15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {selectedLevelModal.breakoutVolumeRatio.toFixed(2)}x {selectedLevelModal.breakoutVolumeRatio >= 1.15 ? '(Hacim Teyitli)' : '(Düşük Hacim)'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase">Sahte Kırılım (Tuzak):</span>
                      <span className={selectedLevelModal.isFakeBreakout ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {selectedLevelModal.isFakeBreakout ? 'EVET (Seviye İçine Geri Dönüldü)' : 'HAYIR'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[10px] uppercase">Rol Değişimi:</span>
                      <span className="text-cyan-400 font-bold">
                        {selectedLevelModal.roleReversal || 'YOK'} {selectedLevelModal.roleReversalType && selectedLevelModal.roleReversalType !== 'NONE' ? `(${selectedLevelModal.roleReversalType})` : ''}
                      </span>
                    </div>
                    {selectedLevelModal.retestStatus && (
                      <div className="pt-1 border-t border-slate-800 text-[11px] text-slate-400">
                        {selectedLevelModal.retestStatus}
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-950/70 rounded border border-slate-800 text-[10px] text-slate-500">
                    Hesaplama Yöntemi: {selectedLevelModal.method || 'Pivot Extrema & Robust Dynamic Clustering'} · As-Of Tarihi: {selectedLevelModal.asOfDate || selectedLevelModal.calculationDate || 'Canlı Güncel'}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLevelModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md font-mono text-xs transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
