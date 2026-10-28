import {
  OHLCV,
  TechnicalIndicators,
  SupportResistanceZone,
  SupportResistanceModel,
  LevelStatus,
  SRCalculationStatus,
  BreakoutEvent,
  AutoChannel,
  PeakAndResistanceMetrics,
  ChartPattern,
  MultiTimeframeTrend,
  ScenarioHorizon,
  TechnicalScoreBreakdown,
  TechnicalScoreWeights,
  ScenarioCalibrationReport,
  TechnicalSignalAudit,
  IndicatorSignalDetail,
  FibonacciAnalysis,
  FibonacciLevel,
  FibSRConfluence,
  MTFConfluenceZone,
  SRHistoricalPerformanceReport
} from '../types.js';

/**
 * FAZ 2: Deterministik Finansal Matematik ve EMA Tabanlı Teknik Analiz Motoru
 * Borsa İstanbul (BIST) pay piyasası için standartlaştırılmış göstergeler:
 * - SMA tamamen kaldırılmış, tüm hesaplamalarda EMA kullanılmıştır.
 * - EMA5 ve EMA20 trend yönleri, kesişimleri ve ana trend sınıflandırması.
 * - EMA20 orta bantlı Bollinger bantları ve kırılım/yakınlık ayrımı.
 * - Gerçek tarihsel veriden destek & direnç, rol değişimi, kırılımlar ve fitil taşması ayrımı.
 * - 16 kapsamlı formasyon tespiti ve otomatik kanallar.
 */

// 1. Exponential Moving Average (EMA) - Birincil Hareketli Ortalama Motoru
export function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (!data || data.length === 0) return result;
  if (data.length < period) {
    return data.map(() => null);
  }

  const multiplier = 2 / (period + 1);

  // İlk EMA tohum değeri ilk 'period' elemanın ortalamasıdır
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sum += data[i];
      result.push(null);
    } else if (i === period - 1) {
      sum += data[i];
      const initialSeed = sum / period;
      result.push(Number(initialSeed.toFixed(4)));
    } else {
      const prevEma = result[i - 1]!;
      const currentEma = (data[i] - prevEma) * multiplier + prevEma;
      result.push(Number(currentEma.toFixed(4)));
    }
  }
  return result;
}

// Geriye dönük uyumluluk: Tüm SMA çağrıları kural 1 gereğince deterministik EMA motoruna yönlendirilir
export function calculateSMA(data: number[], period: number): (number | null)[] {
  return calculateEMA(data, period);
}

// 2. Relative Strength Index (RSI - Wilder's Smoothing)
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (!closes || closes.length <= period) {
    return (closes || []).map(() => null);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  result.push(Number(rsi.toFixed(2)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    result.push(Number(rsi.toFixed(2)));
  }

  return result;
}

// 3. Moving Average Convergence Divergence (MACD 12, 26, 9 - EMA tabanlı)
export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
} {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(Number((fastEMA[i]! - slowEMA[i]!).toFixed(4)));
    }
  }

  const validMacdStartIndex = macdLine.findIndex((v) => v !== null);
  const validMacds = validMacdStartIndex >= 0 ? macdLine.slice(validMacdStartIndex).map((v) => v ?? 0) : [];
  const signalEma = calculateEMA(validMacds, signalPeriod);

  const signalLine: (number | null)[] = [];
  const histogram: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (validMacdStartIndex === -1 || i < validMacdStartIndex) {
      signalLine.push(null);
      histogram.push(null);
    } else {
      const idxInSignal = i - validMacdStartIndex;
      const sig = signalEma[idxInSignal];
      signalLine.push(sig !== null ? Number(sig.toFixed(4)) : null);
      if (macdLine[i] !== null && sig !== null && sig !== undefined) {
        histogram.push(Number((macdLine[i]! - sig).toFixed(4)));
      } else {
        histogram.push(null);
      }
    }
  }

  return { macdLine, signalLine, histogram };
}

// 4. Bollinger Bands (EMA20 Orta Bant, 2 Standart Sapma)
export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
  percentB: (number | null)[];
} {
  const middle = calculateEMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];
  const percentB: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1 || middle[i] === null) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
      percentB.push(null);
    } else {
      let sumSq = 0;
      const ema = middle[i]!;
      for (let j = 0; j < period; j++) {
        const diff = closes[i - j] - ema;
        sumSq += diff * diff;
      }
      const stdDev = Math.sqrt(sumSq / period);
      const u = Number((ema + stdDevMultiplier * stdDev).toFixed(4));
      const l = Number((ema - stdDevMultiplier * stdDev).toFixed(4));
      const bw = Number((((u - l) / ema) * 100).toFixed(2));
      const pb = Number(((closes[i] - l) / (u - l === 0 ? 1 : u - l)).toFixed(3));

      upper.push(u);
      lower.push(l);
      bandwidth.push(bw);
      percentB.push(pb);
    }
  }

  return { upper, middle, lower, bandwidth, percentB };
}

// 5. Average True Range (ATR 14)
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): (number | null)[] {
  const result: (number | null)[] = [];
  if (!highs || highs.length < period) return (highs || []).map(() => null);

  const trueRanges: number[] = [highs[0] - lows[0]];

  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
    result.push(null);
  }
  atr = atr / period;
  result[period - 1] = Number(atr.toFixed(4));

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push(Number(atr.toFixed(4)));
  }

  return result;
}

// 6. Stochastic Oscillator (EMA Düzeltmeli)
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  periodK: number = 14,
  smoothK: number = 3,
  periodD: number = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const rawK: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < periodK - 1) {
      rawK.push(null);
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = 0; j < periodK; j++) {
        if (highs[i - j] > highestHigh) highestHigh = highs[i - j];
        if (lows[i - j] < lowestLow) lowestLow = lows[i - j];
      }
      const range = highestHigh - lowestLow;
      const k = range === 0 ? 50 : ((closes[i] - lowestLow) / range) * 100;
      rawK.push(k);
    }
  }

  const validRawKIdx = rawK.findIndex(v => v !== null);
  const validRawKs = validRawKIdx >= 0 ? rawK.slice(validRawKIdx).map(v => v ?? 50) : [];
  const smoothedK = calculateEMA(validRawKs, smoothK);

  const kValues: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (validRawKIdx === -1 || i < validRawKIdx) {
      kValues.push(null);
    } else {
      const idx = i - validRawKIdx;
      kValues.push(smoothedK[idx] !== null && smoothedK[idx] !== undefined ? Number(smoothedK[idx]!.toFixed(2)) : null);
    }
  }

  const validKIdx = kValues.findIndex(v => v !== null);
  const validKs = validKIdx >= 0 ? kValues.slice(validKIdx).map(v => v ?? 50) : [];
  const dEma = calculateEMA(validKs, periodD);

  const dValues: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (validKIdx === -1 || i < validKIdx) {
      dValues.push(null);
    } else {
      const idx = i - validKIdx;
      dValues.push(dEma[idx] !== null && dEma[idx] !== undefined ? Number(dEma[idx]!.toFixed(2)) : null);
    }
  }

  return { k: kValues, d: dValues };
}

// 7. ADX & Directional Movement (+DI, -DI, ADX 14)
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): {
  adx: (number | null)[];
  pdi: (number | null)[];
  ndi: (number | null)[];
} {
  const pdi: (number | null)[] = [];
  const ndi: (number | null)[] = [];
  const adx: (number | null)[] = [];

  if (!highs || highs.length < period * 2) {
    return {
      adx: (highs || []).map(() => null),
      pdi: (highs || []).map(() => null),
      ndi: (highs || []).map(() => null),
    };
  }

  const tr: number[] = [highs[0] - lows[0]];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const trueRange = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    tr.push(trueRange);
  }

  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothedTR += tr[i];
    smoothedPlusDM += plusDM[i];
    smoothedMinusDM += minusDM[i];
    pdi.push(null);
    ndi.push(null);
  }

  const dxList: number[] = [];

  for (let i = period; i < highs.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + tr[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];

    const currentPdi = smoothedTR === 0 ? 0 : (smoothedPlusDM / smoothedTR) * 100;
    const currentNdi = smoothedTR === 0 ? 0 : (smoothedMinusDM / smoothedTR) * 100;

    pdi.push(Number(currentPdi.toFixed(2)));
    ndi.push(Number(currentNdi.toFixed(2)));

    const diff = Math.abs(currentPdi - currentNdi);
    const sum = currentPdi + currentNdi;
    const dx = sum === 0 ? 0 : (diff / sum) * 100;
    dxList.push(dx);
  }

  for (let i = 0; i < pdi.length; i++) {
    if (i < period * 2 - 1) {
      adx.push(null);
    } else if (i === period * 2 - 1) {
      let sumDx = 0;
      for (let j = 0; j < period; j++) {
        sumDx += dxList[j];
      }
      adx.push(Number((sumDx / period).toFixed(2)));
    } else {
      const prevAdx = adx[i - 1]!;
      const curDx = dxList[i - period];
      const curAdx = (prevAdx * (period - 1) + curDx) / period;
      adx.push(Number(curAdx.toFixed(2)));
    }
  }

  return { adx, pdi, ndi };
}

// 8. Parabolic SAR
export function calculateParabolicSAR(
  highs: number[],
  lows: number[],
  step: number = 0.02,
  maxStep: number = 0.2
): (number | null)[] {
  if (!highs || highs.length === 0) return [];
  const sar: (number | null)[] = [lows[0]];
  let isBullish = true;
  let ep = highs[0];
  let af = step;
  let curSar = lows[0];

  for (let i = 1; i < highs.length; i++) {
    let nextSar = curSar + af * (ep - curSar);

    if (isBullish) {
      if (i >= 2) nextSar = Math.min(nextSar, lows[i - 1], lows[i - 2]);
      else nextSar = Math.min(nextSar, lows[i - 1]);

      if (lows[i] < nextSar) {
        isBullish = false;
        nextSar = ep;
        ep = lows[i];
        af = step;
      } else {
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      if (i >= 2) nextSar = Math.max(nextSar, highs[i - 1], highs[i - 2]);
      else nextSar = Math.max(nextSar, highs[i - 1]);

      if (highs[i] > nextSar) {
        isBullish = true;
        nextSar = ep;
        ep = highs[i];
        af = step;
      } else {
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(af + step, maxStep);
        }
      }
    }

    curSar = nextSar;
    sar.push(Number(curSar.toFixed(4)));
  }

  return sar;
}

// 9. Ichimoku Kinko Hyo
export function calculateIchimoku(
  highs: number[],
  lows: number[],
  closes: number[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52
) {
  const getMidpoint = (startIdx: number, count: number): number | null => {
    if (startIdx < count - 1) return null;
    let high = -Infinity;
    let low = Infinity;
    for (let i = 0; i < count; i++) {
      const idx = startIdx - i;
      if (highs[idx] > high) high = highs[idx];
      if (lows[idx] < low) low = lows[idx];
    }
    return Number(((high + low) / 2).toFixed(4));
  };

  const tenkanSen: (number | null)[] = [];
  const kijunSen: (number | null)[] = [];
  const senkouSpanA: (number | null)[] = [];
  const senkouSpanB: (number | null)[] = [];
  const chikouSpan: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    const t = getMidpoint(i, tenkanPeriod);
    const k = getMidpoint(i, kijunPeriod);
    const sB = getMidpoint(i, senkouBPeriod);

    tenkanSen.push(t);
    kijunSen.push(k);
    senkouSpanB.push(sB);

    if (t !== null && k !== null) {
      senkouSpanA.push(Number(((t + k) / 2).toFixed(4)));
    } else {
      senkouSpanA.push(null);
    }

    chikouSpan.push(closes[i]);
  }

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan };
}

// 10. On-Balance Volume (OBV)
export function calculateOBV(closes: number[], volumes: number[]): number[] {
  if (!closes || closes.length === 0) return [];
  const obv: number[] = [volumes[0] || 0];
  for (let i = 1; i < closes.length; i++) {
    const prev = obv[i - 1];
    if (closes[i] > closes[i - 1]) {
      obv.push(prev + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push(prev - volumes[i]);
    } else {
      obv.push(prev);
    }
  }
  return obv;
}

// 11. Volume-Weighted Average Price (VWAP)
export function calculateVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
  let cumulativeTypicalVol = 0;
  let cumulativeVol = 0;
  const vwap: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes[i] || 1;
    cumulativeTypicalVol += typicalPrice * vol;
    cumulativeVol += vol;

    vwap.push(Number((cumulativeTypicalVol / (cumulativeVol || 1)).toFixed(4)));
  }

  return vwap;
}

// 12. Commodity Channel Index (CCI 20 - EMA Düzeltmeli)
export function calculateCCI(highs: number[], lows: number[], closes: number[], period: number = 20): (number | null)[] {
  const cci: (number | null)[] = [];
  const tp: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    tp.push((highs[i] + lows[i] + closes[i]) / 3);
  }

  const emaTp = calculateEMA(tp, period);

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1 || emaTp[i] === null) {
      cci.push(null);
    } else {
      let meanDev = 0;
      const avg = emaTp[i]!;
      for (let j = 0; j < period; j++) {
        meanDev += Math.abs(tp[i - j] - avg);
      }
      meanDev = meanDev / period;
      const res = meanDev === 0 ? 0 : (tp[i] - avg) / (0.015 * meanDev);
      cci.push(Number(res.toFixed(2)));
    }
  }

  return cci;
}

// 13. Williams %R (14)
export function calculateWilliamsR(highs: number[], lows: number[], closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = 0; j < period; j++) {
        if (highs[i - j] > highestHigh) highestHigh = highs[i - j];
        if (lows[i - j] < lowestLow) lowestLow = lows[i - j];
      }
      const range = highestHigh - lowestLow;
      const wr = range === 0 ? -50 : ((highestHigh - closes[i]) / range) * -100;
      result.push(Number(wr.toFixed(2)));
    }
  }
  return result;
}

// 14. Rate of Change (ROC 12)
export function calculateROC(closes: number[], period: number = 12): (number | null)[] {
  const roc: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      roc.push(null);
    } else {
      const prev = closes[i - period];
      const change = prev === 0 ? 0 : ((closes[i] - prev) / prev) * 100;
      roc.push(Number(change.toFixed(2)));
    }
  }
  return roc;
}

// 15. EMA5 ve EMA20 Trend Yönü ve Kesişimi Motoru (Madde 2 & Madde 3)
export function getEmaTrendStatus(
  closes: number[],
  timeframe: string = '1d',
  lastCandleTime: string = ''
): {
  ema5: number | null;
  ema20: number | null;
  ema5Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ema20Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  mainTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  crossover: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'ABOVE' | 'BELOW' | 'NEUTRAL';
  lastCandleTime: string;
  timeframe: string;
} {
  const ema5Series = calculateEMA(closes, 5);
  const ema20Series = calculateEMA(closes, 20);
  const len = closes.length;

  if (len === 0) {
    return {
      ema5: null,
      ema20: null,
      ema5Trend: 'NEUTRAL',
      ema20Trend: 'NEUTRAL',
      mainTrend: 'NEUTRAL',
      crossover: 'NEUTRAL',
      lastCandleTime,
      timeframe
    };
  }

  const lastIdx = len - 1;
  const prevIdx = len - 2;

  const curPrice = closes[lastIdx];
  const curEma5 = ema5Series[lastIdx];
  const curEma20 = ema20Series[lastIdx];

  const prevEma5 = prevIdx >= 0 ? ema5Series[prevIdx] : null;
  const prevEma20 = prevIdx >= 0 ? ema20Series[prevIdx] : null;

  // EMA5 TREND YÖNÜ: Kapanış EMA5 üzerindeyse boğa yönü, altındaysa ayı, eşitse nötr
  let ema5Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (curEma5 !== null) {
    if (curPrice > curEma5) ema5Trend = 'BULLISH';
    else if (curPrice < curEma5) ema5Trend = 'BEARISH';
    else ema5Trend = 'NEUTRAL';
  }

  // EMA20 TREND YÖNÜ: Kapanış EMA20 üzerindeyse boğa yönü, altındaysa ayı, eşitse nötr
  let ema20Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (curEma20 !== null) {
    if (curPrice > curEma20) ema20Trend = 'BULLISH';
    else if (curPrice < curEma20) ema20Trend = 'BEARISH';
    else ema20Trend = 'NEUTRAL';
  }

  // Ana trend sınıflandırmasında EMA20'yi esas al. EMA5 kısa vadeli trend yönünü göstermeli.
  const mainTrend = ema20Trend;

  // EMA5 / EMA20 KESİŞİMİ:
  // Yukarı kesişim için önceki tamamlanmış mumda EMA5 <= EMA20, son tamamlanmış mumda EMA5 > EMA20 olmalı.
  // Sadece EMA5'in EMA20 üzerinde olması kesişim değildir.
  let crossover: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'ABOVE' | 'BELOW' | 'NEUTRAL' = 'NEUTRAL';
  if (curEma5 !== null && curEma20 !== null) {
    if (prevEma5 !== null && prevEma20 !== null) {
      if (prevEma5 <= prevEma20 && curEma5 > curEma20) {
        crossover = 'BULLISH_CROSS';
      } else if (prevEma5 >= prevEma20 && curEma5 < curEma20) {
        crossover = 'BEARISH_CROSS';
      } else if (curEma5 > curEma20) {
        crossover = 'ABOVE';
      } else if (curEma5 < curEma20) {
        crossover = 'BELOW';
      }
    } else {
      if (curEma5 > curEma20) crossover = 'ABOVE';
      else if (curEma5 < curEma20) crossover = 'BELOW';
    }
  }

  return {
    ema5: curEma5,
    ema20: curEma20,
    ema5Trend,
    ema20Trend,
    mainTrend,
    crossover,
    lastCandleTime,
    timeframe
  };
}

// 16. Bollinger Bantları Durumu ve Kırılım/Yakınlık Ayrımı (Madde 4)
export function getBollingerStatus(closes: number[]) {
  const bb = calculateBollingerBands(closes, 20, 2);
  const len = closes.length;
  if (len < 2) return null;

  const curClose = closes[len - 1];
  const prevClose = closes[len - 2];
  const curMiddle = bb.middle[len - 1];
  const prevMiddle = bb.middle[len - 2];
  const curUpper = bb.upper[len - 1];
  const curLower = bb.lower[len - 1];

  if (curMiddle === null || curUpper === null || curLower === null) return null;

  // Kırılım ile bandın üzerinde bulunmayı kesinlikle birbirinden ayır:
  const crossedAboveMiddle = prevMiddle !== null && prevClose <= prevMiddle && curClose > curMiddle;
  const crossedBelowMiddle = prevMiddle !== null && prevClose >= prevMiddle && curClose < curMiddle;
  const aboveMiddle = curClose > curMiddle;
  const belowMiddle = curClose < curMiddle;

  // Bant yakınlığı: %1.5 tolerans içinde
  const nearUpper = Math.abs(curUpper - curClose) / curUpper <= 0.015 || curClose >= curUpper * 0.985;
  const nearLower = Math.abs(curClose - curLower) / curLower <= 0.015 || curClose <= curLower * 1.015;

  return {
    upper: curUpper,
    middle: curMiddle,
    lower: curLower,
    bandwidth: bb.bandwidth[len - 1] ?? 0,
    percentB: bb.percentB[len - 1] ?? 0.5,
    crossedAboveMiddle,
    crossedBelowMiddle,
    aboveMiddle,
    belowMiddle,
    nearUpper,
    nearLower
  };
}

/**
 * Consolidate all technical indicators for the latest candle (EMA-based)
 */
export function buildTechnicalIndicators(ohlcv: OHLCV[], timeframe: string = '1d'): TechnicalIndicators {
  if (!ohlcv || ohlcv.length === 0) {
    return {
      ema5: null, ema9: null, ema20: null, ema50: null, ema100: null, ema200: null,
      rsi14: null, macd: null, bollinger: null, atr14: null,
      stochastic: null, stochRsi: null, adx14: null, parabolicSar: null,
      ichimoku: null, cci20: null, williamsR14: null, roc12: null,
      obv: null, vwap: null, volumeEma20: null, volumeRatio: null
    };
  }

  const closes = ohlcv.map(b => b.close);
  const highs = ohlcv.map(b => b.high);
  const lows = ohlcv.map(b => b.low);
  const volumes = ohlcv.map(b => b.volume);

  const len = closes.length;
  const lastIdx = len - 1;

  const ema5 = calculateEMA(closes, 5)[lastIdx];
  const ema9 = calculateEMA(closes, 9)[lastIdx];
  const ema20 = calculateEMA(closes, 20)[lastIdx];
  const ema50 = calculateEMA(closes, 50)[lastIdx];
  const ema100 = calculateEMA(closes, 100)[lastIdx];
  const ema200 = calculateEMA(closes, 200)[lastIdx];

  const rsiSeries = calculateRSI(closes, 14);
  const rsi14 = rsiSeries[lastIdx];

  const macdData = calculateMACD(closes);
  const macd = macdData.macdLine[lastIdx] !== null && macdData.signalLine[lastIdx] !== null ? {
    macdLine: macdData.macdLine[lastIdx]!,
    signalLine: macdData.signalLine[lastIdx]!,
    histogram: macdData.histogram[lastIdx]!
  } : null;

  const bbData = calculateBollingerBands(closes);
  const bollinger = bbData.upper[lastIdx] !== null ? {
    upper: bbData.upper[lastIdx]!,
    middle: bbData.middle[lastIdx]!,
    lower: bbData.lower[lastIdx]!,
    bandwidth: bbData.bandwidth[lastIdx]!,
    percentB: bbData.percentB[lastIdx]!
  } : null;

  const atr14 = calculateATR(highs, lows, closes, 14)[lastIdx];

  const stochData = calculateStochastic(highs, lows, closes);
  const stochastic = stochData.k[lastIdx] !== null && stochData.d[lastIdx] !== null ? {
    k: stochData.k[lastIdx]!,
    d: stochData.d[lastIdx]!
  } : null;

  let stochRsi: { k: number; d: number } | null = null;
  const validRsis = rsiSeries.filter((v): v is number => v !== null);
  if (validRsis.length >= 14) {
    const stochRsiCalc = calculateStochastic(validRsis, validRsis, validRsis, 14, 3, 3);
    const lastStochRsiIdx = stochRsiCalc.k.length - 1;
    if (stochRsiCalc.k[lastStochRsiIdx] !== null && stochRsiCalc.d[lastStochRsiIdx] !== null) {
      stochRsi = {
        k: stochRsiCalc.k[lastStochRsiIdx]!,
        d: stochRsiCalc.d[lastStochRsiIdx]!
      };
    }
  }

  const adxData = calculateADX(highs, lows, closes);
  const adx14 = adxData.adx[lastIdx] !== null ? {
    adx: adxData.adx[lastIdx]!,
    pdi: adxData.pdi[lastIdx]!,
    ndi: adxData.ndi[lastIdx]!
  } : null;

  const parabolicSar = calculateParabolicSAR(highs, lows)[lastIdx];

  const ichiData = calculateIchimoku(highs, lows, closes);
  const ichimoku = ichiData.tenkanSen[lastIdx] !== null && ichiData.kijunSen[lastIdx] !== null ? {
    tenkanSen: ichiData.tenkanSen[lastIdx]!,
    kijunSen: ichiData.kijunSen[lastIdx]!,
    senkouSpanA: ichiData.senkouSpanA[lastIdx] || ichiData.tenkanSen[lastIdx]!,
    senkouSpanB: ichiData.senkouSpanB[lastIdx] || ichiData.kijunSen[lastIdx]!,
    chikouSpan: ichiData.chikouSpan[lastIdx]!
  } : null;

  const cci20 = calculateCCI(highs, lows, closes, 20)[lastIdx];
  const williamsR14 = calculateWilliamsR(highs, lows, closes, 14)[lastIdx];
  const roc12 = calculateROC(closes, 12)[lastIdx];

  const obvSeries = calculateOBV(closes, volumes);
  const obv = obvSeries[lastIdx] || null;

  const vwapSeries = calculateVWAP(highs, lows, closes, volumes);
  const vwap = vwapSeries[lastIdx] || null;

  const volEmaSeries = calculateEMA(volumes, 20);
  const volumeEma20 = volEmaSeries[lastIdx];
  const currentVol = volumes[lastIdx] || 0;
  const volumeRatio = volumeEma20 && volumeEma20 > 0 ? Number((currentVol / volumeEma20).toFixed(2)) : 1.0;

  const emaTrends = getEmaTrendStatus(closes, timeframe, ohlcv[lastIdx].dateStr);

  return {
    ema5, ema9, ema20, ema50, ema100, ema200,
    emaTrends,
    rsi14, macd, bollinger, atr14,
    stochastic, stochRsi, adx14, parabolicSar,
    ichimoku, cci20, williamsR14, roc12,
    obv, vwap, volumeEma20, volumeRatio
  };
}

// 17. PROFESYONEL DESTEK VE DİRENÇ HESAPLAMA MOTORU (FAZ 2 / FAZ 5 GELİŞTİRME)
// - Destek ve dirençler tamamen birbirinden bağımsız hesaplanır ve ayrı veri kümelerinde tutulur.
// - Destekler: Geçmiş doğrulanmış pivot diplerden (Pivot Low) türetilir. Kırmızı (#ef4444).
// - Dirençler: Geçmiş doğrulanmış pivot tepelerden (Pivot High) türetilir. Yeşil (#10b981).
// - Fiyat geometrisi doğrulanır, yinelenen zaman damgaları ayıklanır, bozuk veriler düzeltilir.
// - Dinamik ATR toleransıyla kümeleme yapılır; zincirleme genişlemeye karşı koruma vardır.
// - Güç skoru: Bağımsız testler, tepki büyüklüğü, güncellik ve tutarlılığa dayalı kural tabanlı skordur (0-100).
// - Kırılım ve retest durumları tamamlanmış mum kapanışlarıyla sınıflandırılır.

export interface PivotCandidate {
  candidateType: 'pivot_low' | 'pivot_high';
  price: number;
  timestamp: string;
  index: number;
  sourceTimeframe: string;
  confirmed: boolean;
  volume: number;
  reactionMagnitudePct: number;
  formationDate?: string;
  confirmationDate?: string;
}

/**
 * B. GERÇEK FİYAT VERİSİNİN DOĞRULANMASI (Validation for Support & Resistance)
 */
export function validateCandlesForSR(
  ohlcv: OHLCV[],
  symbol: string = 'BIST',
  timeframe: string = '1d'
): {
  validCandles: OHLCV[];
  status: SRCalculationStatus;
  warnings: string[];
  dataStartTime: string | null;
  dataEndTime: string | null;
  priceType: string;
} {
  const warnings: string[] = [];

  if (!ohlcv || ohlcv.length === 0) {
    return {
      validCandles: [],
      status: 'NO_DATA',
      warnings: ['Bu hisse ve zaman dilimi için kullanılabilir fiyat verisi bulunamadı.'],
      dataStartTime: null,
      dataEndTime: null,
      priceType: 'HAM_FIYAT (OHLC)'
    };
  }

  // 1. Clean, sort & check duplicates
  const sorted = [...ohlcv].sort((a, b) => {
    const tA = typeof a.timestamp === 'number' && !isNaN(a.timestamp) ? a.timestamp : new Date(a.dateStr || 0).getTime();
    const tB = typeof b.timestamp === 'number' && !isNaN(b.timestamp) ? b.timestamp : new Date(b.dateStr || 0).getTime();
    return tA - tB;
  });

  const uniqueMap = new Map<string, OHLCV>();
  for (const c of sorted) {
    const key = (c.timestamp !== undefined && c.timestamp !== null && !isNaN(Number(c.timestamp)))
      ? String(c.timestamp)
      : (c.dateStr || '');
    uniqueMap.set(key, c);
  }
  const deduped = Array.from(uniqueMap.values());

  if (deduped.length < sorted.length) {
    warnings.push(`${sorted.length - deduped.length} adet yinelenen zaman damgalı mum filtrelendi.`);
  }

  const validCandles: OHLCV[] = [];
  let correctedCount = 0;

  for (const c of deduped) {
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume || 0);

    if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close) || open <= 0 || close <= 0) {
      warnings.push(`Geçersiz veya sıfır/negatif fiyatlı mum atlandı: ${c.dateStr || c.timestamp}`);
      continue;
    }

    let correctedHigh = high;
    let correctedLow = low;
    let isCorrected = false;

    const maxBar = Math.max(open, close, low, high);
    const minBar = Math.min(open, close, low, high);

    if (high < Math.max(open, close) || high < low) {
      correctedHigh = maxBar;
      isCorrected = true;
    }
    if (low > Math.min(open, close) || low > high) {
      correctedLow = minBar;
      isCorrected = true;
    }

    if (isCorrected) {
      correctedCount++;
    }

    validCandles.push({
      ...c,
      open,
      high: correctedHigh,
      low: correctedLow,
      close,
      volume: Math.max(0, volume),
      validationStatus: isCorrected ? 'CORRECTED' : 'VALID'
    });
  }

  if (correctedCount > 0) {
    warnings.push(`${correctedCount} adet mumda High/Low geometrisi matematiksel olarak düzeltildi.`);
  }

  const dataStartTime = validCandles.length > 0 ? (validCandles[0].dateStr || new Date(validCandles[0].timestamp).toISOString()) : null;
  const dataEndTime = validCandles.length > 0 ? (validCandles[validCandles.length - 1].dateStr || new Date(validCandles[validCandles.length - 1].timestamp).toISOString()) : null;

  // Minimum required bars for statistical pivot validity (at least 15 bars)
  if (validCandles.length < 15) {
    return {
      validCandles,
      status: 'INSUFFICIENT_DATA',
      warnings: [
        `Destek ve direnç analizi için yeterli geçmiş fiyat verisi bulunmuyor. Mevcut veri aralığı: ${dataStartTime || '-'} – ${dataEndTime || '-'}.`,
        ...warnings
      ],
      dataStartTime,
      dataEndTime,
      priceType: 'HAM_FIYAT (OHLC) / Kurumsal işlem düzeltmesi teyitli'
    };
  }

  return {
    validCandles,
    status: 'SUCCESS',
    warnings,
    dataStartTime,
    dataEndTime,
    priceType: 'HAM_FIYAT (OHLC) / Kurumsal işlem düzeltmesi teyitli'
  };
}

/**
 * C. DESTEK ADAYLARININ HESAPLANMASI (Pivot Low Detection)
 * Tamamen bağımsız dip tespiti. Sağdaki rightBars tamamlanmadan kesinleşmiş sayılmaz.
 */
export function detectPivotLows(
  ohlcv: OHLCV[],
  leftBars: number = 3,
  rightBars: number = 3,
  timeframe: string = '1d'
): PivotCandidate[] {
  const candidates: PivotCandidate[] = [];
  const len = ohlcv.length;
  if (len < leftBars + rightBars + 1) return [];

  for (let i = leftBars; i < len - rightBars; i++) {
    const curLow = ohlcv[i].low;
    let isPivot = true;

    // Sol taraf kontrolü (leftBars)
    for (let j = 1; j <= leftBars; j++) {
      if (ohlcv[i - j].low < curLow) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // Sağ taraf kontrolü (rightBars): kesinleşmiş teyit
    for (let k = 1; k <= rightBars; k++) {
      if (ohlcv[i + k].low <= curLow) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // Eşit dipler kontrolü (ardışık veya çok yakın eşit diplerde mükerrer pivot üretimini engelle)
    const prevCandidate = candidates[candidates.length - 1];
    if (prevCandidate && i - prevCandidate.index <= 2 && Math.abs(curLow - prevCandidate.price) / (curLow || 1) < 0.002) {
      continue;
    }

    // Tepki büyüklüğü hesabı: pivot oluştuktan sonraki 5-10 bar içinde fiyatın yukarı ne kadar uzaklaştığı
    const lookahead = Math.min(len, i + rightBars + 7);
    let maxHighAfter = curLow;
    for (let m = i + 1; m < lookahead; m++) {
      if (ohlcv[m].high > maxHighAfter) maxHighAfter = ohlcv[m].high;
    }
    const reactionMagnitudePct = curLow > 0 ? Number((((maxHighAfter - curLow) / curLow) * 100).toFixed(2)) : 0;

    const formationDate = ohlcv[i].dateStr || new Date(ohlcv[i].timestamp).toISOString().split('T')[0];
    const confBar = i + rightBars < len ? ohlcv[i + rightBars] : ohlcv[len - 1];
    const confirmationDate = confBar.dateStr || new Date(confBar.timestamp).toISOString().split('T')[0];

    candidates.push({
      candidateType: 'pivot_low',
      price: curLow,
      timestamp: ohlcv[i].dateStr,
      index: i,
      sourceTimeframe: timeframe,
      confirmed: true,
      volume: ohlcv[i].volume || 0,
      reactionMagnitudePct,
      formationDate,
      confirmationDate
    });
  }

  // Mutlak dönem tabanı (Period Low)
  const allLows = ohlcv.map(b => b.low);
  const minPeriodLow = Math.min(...allLows);
  const minIdx = allLows.lastIndexOf(minPeriodLow);
  if (minIdx >= leftBars && !candidates.some(c => Math.abs(c.price - minPeriodLow) / (minPeriodLow || 1) < 0.005)) {
    const curPrice = ohlcv[len - 1].close;
    const reaction = minPeriodLow > 0 ? Number((((curPrice - minPeriodLow) / minPeriodLow) * 100).toFixed(2)) : 0;
    const formDate = ohlcv[minIdx].dateStr || new Date(ohlcv[minIdx].timestamp).toISOString().split('T')[0];
    const confIdx = Math.min(len - 1, minIdx + rightBars);
    const confDate = ohlcv[confIdx].dateStr || new Date(ohlcv[confIdx].timestamp).toISOString().split('T')[0];

    candidates.push({
      candidateType: 'pivot_low',
      price: minPeriodLow,
      timestamp: ohlcv[minIdx].dateStr,
      index: minIdx,
      sourceTimeframe: timeframe,
      confirmed: minIdx <= len - 1 - rightBars,
      volume: ohlcv[minIdx].volume || 0,
      reactionMagnitudePct: Math.max(0, reaction),
      formationDate: formDate,
      confirmationDate: confDate
    });
  }

  return candidates;
}

/**
 * D. DİRENÇ ADAYLARININ HESAPLANMASI (Pivot High Detection)
 * Tamamen bağımsız tepe tespiti. Destek adaylarıyla karıştırılmaz.
 */
export function detectPivotHighs(
  ohlcv: OHLCV[],
  leftBars: number = 3,
  rightBars: number = 3,
  timeframe: string = '1d'
): PivotCandidate[] {
  const candidates: PivotCandidate[] = [];
  const len = ohlcv.length;
  if (len < leftBars + rightBars + 1) return [];

  for (let i = leftBars; i < len - rightBars; i++) {
    const curHigh = ohlcv[i].high;
    let isPivot = true;

    // Sol taraf kontrolü
    for (let j = 1; j <= leftBars; j++) {
      if (ohlcv[i - j].high > curHigh) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // Sağ taraf kontrolü: kesinleşmiş teyit
    for (let k = 1; k <= rightBars; k++) {
      if (ohlcv[i + k].high >= curHigh) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // Eşit tepeler kontrolü
    const prevCandidate = candidates[candidates.length - 1];
    if (prevCandidate && i - prevCandidate.index <= 2 && Math.abs(curHigh - prevCandidate.price) / (curHigh || 1) < 0.002) {
      continue;
    }

    // Fiyat reddedilme / aşağı tepki büyüklüğü
    const lookahead = Math.min(len, i + rightBars + 7);
    let minLowAfter = curHigh;
    for (let m = i + 1; m < lookahead; m++) {
      if (ohlcv[m].low < minLowAfter) minLowAfter = ohlcv[m].low;
    }
    const reactionMagnitudePct = curHigh > 0 ? Number((((curHigh - minLowAfter) / curHigh) * 100).toFixed(2)) : 0;

    const formationDate = ohlcv[i].dateStr || new Date(ohlcv[i].timestamp).toISOString().split('T')[0];
    const confBar = i + rightBars < len ? ohlcv[i + rightBars] : ohlcv[len - 1];
    const confirmationDate = confBar.dateStr || new Date(confBar.timestamp).toISOString().split('T')[0];

    candidates.push({
      candidateType: 'pivot_high',
      price: curHigh,
      timestamp: ohlcv[i].dateStr,
      index: i,
      sourceTimeframe: timeframe,
      confirmed: true,
      volume: ohlcv[i].volume || 0,
      reactionMagnitudePct,
      formationDate,
      confirmationDate
    });
  }

  // Mutlak dönem tavanı (Period High)
  const allHighs = ohlcv.map(b => b.high);
  const maxPeriodHigh = Math.max(...allHighs);
  const maxIdx = allHighs.lastIndexOf(maxPeriodHigh);
  if (maxIdx >= leftBars && !candidates.some(c => Math.abs(c.price - maxPeriodHigh) / (maxPeriodHigh || 1) < 0.005)) {
    const curPrice = ohlcv[len - 1].close;
    const reaction = maxPeriodHigh > 0 ? Number((((maxPeriodHigh - curPrice) / maxPeriodHigh) * 100).toFixed(2)) : 0;
    const formDate = ohlcv[maxIdx].dateStr || new Date(ohlcv[maxIdx].timestamp).toISOString().split('T')[0];
    const confIdx = Math.min(len - 1, maxIdx + rightBars);
    const confDate = ohlcv[confIdx].dateStr || new Date(ohlcv[confIdx].timestamp).toISOString().split('T')[0];

    candidates.push({
      candidateType: 'pivot_high',
      price: maxPeriodHigh,
      timestamp: ohlcv[maxIdx].dateStr,
      index: maxIdx,
      sourceTimeframe: timeframe,
      confirmed: maxIdx <= len - 1 - rightBars,
      volume: ohlcv[maxIdx].volume || 0,
      reactionMagnitudePct: Math.max(0, reaction),
      formationDate: formDate,
      confirmationDate: confDate
    });
  }

  return candidates;
}

/**
 * E. FİYAT BÖLGELERİNİ BİRLEŞTİRME & KÜMELEME (Clustering with ATR/Percent Tolerance)
 * Asla sabit TL toleransı kullanılmaz. Zincirleme aşırı geniş bölgeler engellenir.
 */
export function clusterCandidatesIntoZones(
  candidates: PivotCandidate[],
  currentPrice: number,
  currentAtr: number,
  type: 'SUPPORT' | 'RESISTANCE',
  timeframe: string = '1d',
  calculationPeriod: string = '1y'
): {
  id: string;
  representativePrice: number;
  zoneLow: number;
  zoneHigh: number;
  pivots: PivotCandidate[];
  firstObservedAt: string;
  lastObservedAt: string;
}[] {
  if (candidates.length === 0) return [];

  // Dinamik tolerans: ATR'nin %75'i ile hisse fiyatının %0.8'i arasında orantılı tolerans
  const tolerance = Math.max(currentAtr * 0.75, currentPrice * 0.008);
  const maxClusterWidth = tolerance * 2.2; // Zincirleme birleşme tavanı

  const sorted = [...candidates].sort((a, b) => a.price - b.price);

  interface RawCluster {
    pivots: PivotCandidate[];
    minPrice: number;
    maxPrice: number;
  }
  const clusters: RawCluster[] = [];

  for (const p of sorted) {
    let merged = false;
    for (const c of clusters) {
      const avg = c.pivots.reduce((sum, item) => sum + item.price, 0) / c.pivots.length;
      const wouldBeMin = Math.min(c.minPrice, p.price);
      const wouldBeMax = Math.max(c.maxPrice, p.price);

      if (Math.abs(p.price - avg) <= tolerance && (wouldBeMax - wouldBeMin) <= maxClusterWidth) {
        c.pivots.push(p);
        c.minPrice = wouldBeMin;
        c.maxPrice = wouldBeMax;
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        pivots: [p],
        minPrice: p.price,
        maxPrice: p.price
      });
    }
  }

  return clusters.map((c, idx) => {
    const prices = c.pivots.map(p => p.price).sort((a, b) => a - b);
    const midIdx = Math.floor(prices.length / 2);
    const representativePrice = prices.length % 2 !== 0
      ? prices[midIdx]
      : Number(((prices[midIdx - 1] + prices[midIdx]) / 2).toFixed(2));

    const zoneLow = Math.min(...prices);
    const zoneHigh = Math.max(...prices);

    const effectiveLow = zoneLow === zoneHigh ? Number((zoneLow - currentAtr * 0.15).toFixed(2)) : zoneLow;
    const effectiveHigh = zoneLow === zoneHigh ? Number((zoneHigh + currentAtr * 0.15).toFixed(2)) : zoneHigh;

    const timestamps = c.pivots.map(p => p.timestamp).filter(Boolean).sort();
    const firstObservedAt = timestamps[0] || '';
    const lastObservedAt = timestamps[timestamps.length - 1] || '';

    return {
      id: `${type.toLowerCase()}_zone_${idx}_${representativePrice.toFixed(2).replace('.', '_')}`,
      representativePrice: Number(representativePrice.toFixed(2)),
      zoneLow: effectiveLow,
      zoneHigh: effectiveHigh,
      pivots: c.pivots,
      firstObservedAt,
      lastObservedAt
    };
  });
}

/**
 * F. TEST SAYISI VE GÜÇ PUANINI DEĞERLENDİRME & ROL DEĞİŞİMİ / KIRILIM ANALİZİ
 */
export function evaluateZoneDynamics(
  zone: {
    id: string;
    representativePrice: number;
    zoneLow: number;
    zoneHigh: number;
    pivots: PivotCandidate[];
    firstObservedAt: string;
    lastObservedAt: string;
  },
  ohlcv: OHLCV[],
  currentPrice: number,
  currentAtr: number,
  type: 'SUPPORT' | 'RESISTANCE',
  timeframe: string = '1d',
  calculationPeriod: string = '1y',
  symbol: string = 'BIST',
  asOfDate?: string
): SupportResistanceZone {
  const len = ohlcv.length;
  let independentTouches = 0;
  let inZone = false;
  let lastTouchDate = zone.lastObservedAt;
  let maxReaction = Math.max(...zone.pivots.map(p => p.reactionMagnitudePct), 0);

  const touchThresholdHigh = zone.zoneHigh + currentAtr * 0.15;
  const touchThresholdLow = zone.zoneLow - currentAtr * 0.15;

  let bounceCount = 0;

  for (let i = 0; i < len; i++) {
    const bar = ohlcv[i];
    const isTouching = bar.low <= touchThresholdHigh && bar.high >= touchThresholdLow;

    if (isTouching) {
      if (!inZone) {
        independentTouches++;
        inZone = true;
        lastTouchDate = bar.dateStr;

        // Check if price reacted/bounced >= 1.0% within the next 1-5 bars
        const lookahead = Math.min(len, i + 6);
        let hasBounced = false;
        for (let m = i + 1; m < lookahead; m++) {
          if (type === 'SUPPORT') {
            if (ohlcv[m].high >= zone.representativePrice * 1.01) {
              hasBounced = true;
              break;
            }
          } else {
            if (ohlcv[m].low <= zone.representativePrice * 0.99) {
              hasBounced = true;
              break;
            }
          }
        }
        if (hasBounced) {
          bounceCount++;
        }
      }
    } else {
      if (type === 'SUPPORT' && bar.low > touchThresholdHigh + currentAtr * 0.75) {
        inZone = false;
      } else if (type === 'RESISTANCE' && bar.high < touchThresholdLow - currentAtr * 0.75) {
        inZone = false;
      }
    }
  }

  const finalTouchCount = Math.max(zone.pivots.length, independentTouches);

  let recencyBonus = 0;
  if (lastTouchDate) {
    const lastBarIdx = ohlcv.findIndex(b => b.dateStr === lastTouchDate);
    if (lastBarIdx !== -1) {
      const barsAgo = len - 1 - lastBarIdx;
      if (barsAgo <= 15) recencyBonus = 15;
      else if (barsAgo <= 45) recencyBonus = 10;
      else if (barsAgo <= 90) recencyBonus = 5;
    }
  }

  const pivotScore = Math.min(zone.pivots.length * 15, 30);
  const touchScore = Math.min(finalTouchCount * 8, 30);
  const reactionScore = Math.min(maxReaction * 2.5, 20);
  const tightnessScore = Math.max(0, 10 - (((zone.zoneHigh - zone.zoneLow) / (zone.representativePrice || 1)) * 100));
  const rawStrength = Math.round(pivotScore + touchScore + reactionScore + tightnessScore + recencyBonus + 5);
  const strengthScore = Math.min(100, Math.max(15, rawStrength));

  // Breakout, Volume, Fake Breakout & Role Reversal Detection
  let status: LevelStatus = 'active';
  let breakoutAt: string | null = null;
  let breakoutDate: string | null = null;
  let breakoutClose: number | null = null;
  let breakoutVolumeRatio: number | null = null;
  let isFakeBreakout = false;
  let retestCount = 0;
  let isRetestSuccessful = false;
  let roleReversal: 'CONFIRMED_FLIP' | 'PENDING_CONFIRMATION' | 'NONE' = 'NONE';
  let roleReversalType: 'SUPPORT_TO_RESISTANCE' | 'RESISTANCE_TO_SUPPORT' | 'NONE' = 'NONE';
  let roleReversalDate: string | null = null;
  let colorHex = type === 'SUPPORT' ? '#ef4444' : '#10b981';
  let retestStatus = '';

  const formationDate = zone.pivots[0]?.formationDate || zone.firstObservedAt || (ohlcv[0]?.dateStr || '');
  const confirmationDate = zone.pivots[0]?.confirmationDate || zone.lastObservedAt || formationDate;
  const firstPivotIdx = zone.pivots[0]?.index ?? 0;

  if (type === 'SUPPORT') {
    // Breakout requires CLOSE below support zone buffer (wick penetration alone is not breakout)
    const breakoutThreshold = zone.zoneLow - currentAtr * 0.20;
    let breakoutBarIdx = -1;

    for (let idx = firstPivotIdx; idx < len; idx++) {
      const b = ohlcv[idx];
      if (b.close < breakoutThreshold) {
        breakoutBarIdx = idx;
        breakoutAt = b.dateStr;
        breakoutDate = b.dateStr;
        breakoutClose = b.close;

        // Calculate 20-bar volume average
        const vStart = Math.max(0, idx - 20);
        const vSlice = ohlcv.slice(vStart, idx);
        const vAvg = vSlice.length > 0 ? (vSlice.reduce((s, x) => s + (x.volume || 0), 0) / vSlice.length) : (b.volume || 1);
        breakoutVolumeRatio = vAvg > 0 ? Number(((b.volume || 0) / vAvg).toFixed(2)) : 1.0;
        break;
      }
    }

    if (breakoutBarIdx !== -1) {
      // Check for fake breakdown: within 1 to 3 bars after breakdown, close returns above zoneLow
      for (let k = 1; k <= 3 && breakoutBarIdx + k < len; k++) {
        if (ohlcv[breakoutBarIdx + k].close >= zone.zoneLow) {
          isFakeBreakout = true;
          break;
        }
      }

      if (isFakeBreakout) {
        status = 'active';
        colorHex = '#ef4444';
        retestStatus = 'Sahte kırılım (Ayı Tuzağı) - Fiyat seviye içine geri döndü';
      } else {
        // Real breakdown confirmed. Now check retest from below
        roleReversalType = 'SUPPORT_TO_RESISTANCE';

        for (let idx = breakoutBarIdx + 1; idx < len; idx++) {
          const b = ohlcv[idx];
          const isRetestingFromBelow = b.high >= zone.zoneLow - currentAtr * 0.25 && b.close <= zone.zoneHigh + currentAtr * 0.15;
          if (isRetestingFromBelow) {
            retestCount++;
            // Check rejection: subsequent candle closes down or drops >= 1.0% from zone
            const postRetest = idx + 1 < len ? ohlcv[idx + 1] : null;
            if (postRetest && (postRetest.close < zone.zoneLow || postRetest.low <= zone.representativePrice * 0.99)) {
              isRetestSuccessful = true;
              roleReversal = 'CONFIRMED_FLIP';
              roleReversalDate = b.dateStr;
              status = 'flipped_resistance'; // New Resistance Candidate
              colorHex = '#f97316'; // Orange
              retestStatus = 'Destekten dirence dönüştü (Rol değişimi teyitli)';
              break;
            } else {
              roleReversal = 'PENDING_CONFIRMATION';
              status = 'pending_flip';
              colorHex = '#eab308'; // Amber/Yellow
              retestStatus = 'Aşağı kırıldı, yeni direnç rol teyidi bekleniyor';
            }
          }
        }

        if (roleReversal === 'NONE') {
          if (currentPrice < zone.zoneLow) {
            status = 'broken';
            colorHex = '#ef4444';
            retestStatus = 'Aşağı kırıldı, yeni direnç adayı';
          } else {
            status = 'retest';
            colorHex = '#eab308';
            retestStatus = 'Kırılım sonrası retest aşamasında';
          }
        }
      }
    } else {
      status = 'active';
      colorHex = '#ef4444';
      retestStatus = 'Aktif destek koridoru';
    }
  } else {
    // RESISTANCE: Breakout requires CLOSE above resistance zone buffer
    const breakoutThreshold = zone.zoneHigh + currentAtr * 0.20;
    let breakoutBarIdx = -1;

    for (let idx = firstPivotIdx; idx < len; idx++) {
      const b = ohlcv[idx];
      if (b.close > breakoutThreshold) {
        breakoutBarIdx = idx;
        breakoutAt = b.dateStr;
        breakoutDate = b.dateStr;
        breakoutClose = b.close;

        // Calculate 20-bar volume average
        const vStart = Math.max(0, idx - 20);
        const vSlice = ohlcv.slice(vStart, idx);
        const vAvg = vSlice.length > 0 ? (vSlice.reduce((s, x) => s + (x.volume || 0), 0) / vSlice.length) : (b.volume || 1);
        breakoutVolumeRatio = vAvg > 0 ? Number(((b.volume || 0) / vAvg).toFixed(2)) : 1.0;
        break;
      }
    }

    if (breakoutBarIdx !== -1) {
      // Check for fake breakout: within 1 to 3 bars after breakout, close returns below zoneHigh
      for (let k = 1; k <= 3 && breakoutBarIdx + k < len; k++) {
        if (ohlcv[breakoutBarIdx + k].close <= zone.zoneHigh) {
          isFakeBreakout = true;
          break;
        }
      }

      if (isFakeBreakout) {
        status = 'active';
        colorHex = '#10b981';
        retestStatus = 'Sahte kırılım (Boğa Tuzağı) - Fiyat seviye içine geri döndü';
      } else {
        // Real breakout confirmed. Now check retest from above
        roleReversalType = 'RESISTANCE_TO_SUPPORT';

        for (let idx = breakoutBarIdx + 1; idx < len; idx++) {
          const b = ohlcv[idx];
          const isRetestingFromAbove = b.low <= zone.zoneHigh + currentAtr * 0.25 && b.close >= zone.zoneLow - currentAtr * 0.15;
          if (isRetestingFromAbove) {
            retestCount++;
            // Check bounce: subsequent candle closes up or rises >= 1.0% from zone
            const postRetest = idx + 1 < len ? ohlcv[idx + 1] : null;
            if (postRetest && (postRetest.close > zone.zoneHigh || postRetest.high >= zone.representativePrice * 1.01)) {
              isRetestSuccessful = true;
              roleReversal = 'CONFIRMED_FLIP';
              roleReversalDate = b.dateStr;
              status = 'flipped_support'; // New Support Candidate
              colorHex = '#38bdf8'; // Light Blue
              retestStatus = 'Dirençten desteğe dönüştü (Rol değişimi teyitli)';
              break;
            } else {
              roleReversal = 'PENDING_CONFIRMATION';
              status = 'pending_flip';
              colorHex = '#eab308'; // Amber/Yellow
              retestStatus = 'Yukarı kırıldı, yeni destek rol teyidi bekleniyor';
            }
          }
        }

        if (roleReversal === 'NONE') {
          if (currentPrice > zone.zoneHigh) {
            status = 'broken';
            colorHex = '#10b981';
            retestStatus = 'Yukarı kırıldı, yeni destek adayı';
          } else {
            status = 'retest';
            colorHex = '#eab308';
            retestStatus = 'Kırılım sonrası retest aşamasında';
          }
        }
      }
    } else {
      status = 'active';
      colorHex = '#10b981';
      retestStatus = 'Aktif direnç koridoru';
    }
  }

  // I. UZAKLIK HESAPLAMALARI
  // Destek uzaklığı: ((C - S) / S) * 100
  // Direnç uzaklığı: ((R - C) / C) * 100
  let distancePercent = 0;
  if (type === 'SUPPORT') {
    distancePercent = zone.representativePrice > 0
      ? Number((((currentPrice - zone.representativePrice) / zone.representativePrice) * 100).toFixed(2))
      : 0;
  } else {
    distancePercent = currentPrice > 0
      ? Number((((zone.representativePrice - currentPrice) / currentPrice) * 100).toFixed(2))
      : 0;
  }

  return {
    id: zone.id,
    symbol,
    asOfDate,
    calculationDate: asOfDate || (ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].dateStr : new Date().toISOString().split('T')[0]),
    price: zone.representativePrice,
    zoneLow: zone.zoneLow,
    zoneHigh: zone.zoneHigh,
    type,
    timeframe,
    calculationPeriod,
    method: 'Pivot Extrema & Robust Dynamic Clustering',
    formationDate,
    confirmationDate,
    pivotCount: zone.pivots.length,
    touchCount: finalTouchCount,
    bounceCount,
    lastTouchAt: lastTouchDate,
    firstObservedAt: zone.firstObservedAt,
    strengthScore,
    distancePercent,
    status,
    breakoutAt,
    breakoutDate,
    breakoutClose,
    breakoutVolumeRatio,
    isFakeBreakout,
    retestCount,
    isRetestSuccessful,
    roleReversal,
    roleReversalType,
    roleReversalDate,
    retestStatus,
    source: 'Borsa İstanbul Gerçek Veri Motoru (Pivot Extrema & Robust Clustering)',
    dataQuality: 'VERIFIED',
    pivotPrice: zone.representativePrice,
    priceLow: zone.zoneLow,
    priceHigh: zone.zoneHigh,
    lastTestedDate: lastTouchDate,
    colorHex,
    period: calculationPeriod,
    lastTouchDate,
    reboundPct: Number(maxReaction.toFixed(2)),
    isMajorFloor: type === 'SUPPORT' && Math.abs(zone.zoneLow - Math.min(...ohlcv.map(b => b.low))) < currentAtr * 0.5,
    isMajorCeiling: type === 'RESISTANCE' && Math.abs(zone.zoneHigh - Math.max(...ohlcv.map(b => b.high))) < currentAtr * 0.5
  };
}

/**
 * Filtreleme: asOfDate bazlı mum filtreleme (Sıfır Gelecek Sızıntısı / Zero Lookahead Bias)
 */
export function filterCandlesAsOfDate(ohlcv: OHLCV[], asOfDate?: string): OHLCV[] {
  if (!asOfDate || !ohlcv || ohlcv.length === 0) return ohlcv;
  const targetDate = asOfDate.includes('T') ? asOfDate.split('T')[0] : asOfDate.trim();
  const targetTime = new Date(targetDate).getTime() + 24 * 60 * 60 * 1000 - 1;

  return ohlcv.filter(c => {
    if (c.dateStr) {
      const dStr = c.dateStr.includes('T') ? c.dateStr.split('T')[0] : c.dateStr;
      return dStr <= targetDate;
    }
    const t = typeof c.timestamp === 'number' ? c.timestamp : new Date(c.timestamp).getTime();
    return t <= targetTime;
  });
}

/**
 * FIBONACCI RETRACEMENT & EXTENSION MOTORU
 */
export function calculateFibonacciLevels(
  ohlcv: OHLCV[],
  options?: {
    manualHigh?: number;
    manualLow?: number;
    asOfDate?: string;
  }
): FibonacciAnalysis {
  const candles = filterCandlesAsOfDate(ohlcv, options?.asOfDate);
  if (!candles || candles.length === 0) {
    return {
      direction: 'UPTREND',
      swingHigh: { price: 0, date: '', index: 0 },
      swingLow: { price: 0, date: '', index: 0 },
      retracements: [],
      extensions: [],
      priceRange: 0,
      mode: 'AUTO',
      disclaimer: 'Fibonacci ve Destek/Direnç kesişimleri sadece istatistiksel ilgi bölgelerini işaret eder, kesin dönüş garantisi taşımaz ve yatırım tavsiyesi değildir.'
    };
  }

  let swingHighPrice = options?.manualHigh;
  let swingLowPrice = options?.manualLow;
  let swingHighDate = '';
  let swingLowDate = '';
  let swingHighIdx = 0;
  let swingLowIdx = 0;
  const mode: 'AUTO' | 'MANUAL' = (swingHighPrice !== undefined && swingLowPrice !== undefined && !isNaN(swingHighPrice) && !isNaN(swingLowPrice))
    ? 'MANUAL'
    : 'AUTO';

  if (mode === 'AUTO') {
    let maxP = -Infinity;
    let minP = Infinity;
    candles.forEach((c, idx) => {
      if (c.high > maxP) {
        maxP = c.high;
        swingHighPrice = c.high;
        swingHighDate = c.dateStr;
        swingHighIdx = idx;
      }
      if (c.low < minP) {
        minP = c.low;
        swingLowPrice = c.low;
        swingLowDate = c.dateStr;
        swingLowIdx = idx;
      }
    });
  } else {
    swingHighPrice = swingHighPrice!;
    swingLowPrice = swingLowPrice!;
    const hBar = candles.find(c => Math.abs(c.high - swingHighPrice!) < 0.05) || candles[candles.length - 1];
    const lBar = candles.find(c => Math.abs(c.low - swingLowPrice!) < 0.05) || candles[0];
    swingHighDate = hBar.dateStr;
    swingLowDate = lBar.dateStr;
    swingHighIdx = candles.indexOf(hBar);
    swingLowIdx = candles.indexOf(lBar);
  }

  if (swingHighPrice! < swingLowPrice!) {
    const tmp = swingHighPrice!;
    swingHighPrice = swingLowPrice;
    swingLowPrice = tmp;
  }

  const delta = (swingHighPrice || 0) - (swingLowPrice || 0);
  const direction: 'UPTREND' | 'DOWNTREND' = swingLowIdx <= swingHighIdx ? 'UPTREND' : 'DOWNTREND';

  const retracementRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const extensionRatios = [1.272, 1.618, 2.0, 2.618];

  const retracements: FibonacciLevel[] = retracementRatios.map(ratio => {
    let price = 0;
    if (direction === 'UPTREND') {
      price = (swingHighPrice || 0) - ratio * delta;
    } else {
      price = (swingLowPrice || 0) + ratio * delta;
    }
    const ratioPct = Number((ratio * 100).toFixed(1));
    return {
      ratio,
      ratioFormatted: `%${ratioPct}`,
      price: Number(price.toFixed(2)),
      type: 'RETRACEMENT',
      label: ratio === 0 ? 'Fib %0.0' : ratio === 1.0 ? 'Fib %100.0' : `Fib %${ratioPct}`
    };
  });

  const extensions: FibonacciLevel[] = extensionRatios.map(ratio => {
    let price = 0;
    if (direction === 'UPTREND') {
      price = (swingLowPrice || 0) + ratio * delta;
    } else {
      price = (swingHighPrice || 0) - ratio * delta;
    }
    const ratioPct = Number((ratio * 100).toFixed(1));
    return {
      ratio,
      ratioFormatted: `%${ratioPct}`,
      price: Number(price.toFixed(2)),
      type: 'EXTENSION',
      label: `Fib Uzatma %${ratioPct}`
    };
  });

  return {
    direction,
    swingHigh: {
      price: Number((swingHighPrice || 0).toFixed(2)),
      date: swingHighDate,
      index: swingHighIdx
    },
    swingLow: {
      price: Number((swingLowPrice || 0).toFixed(2)),
      date: swingLowDate,
      index: swingLowIdx
    },
    retracements,
    extensions,
    priceRange: Number(delta.toFixed(2)),
    mode,
    asOfDate: options?.asOfDate,
    disclaimer: 'Fibonacci ve Destek/Direnç kesişimleri sadece istatistiksel ilgi bölgelerini işaret eder, kesin dönüş garantisi taşımaz ve yatırım tavsiyesi değildir.'
  };
}

/**
 * FIBONACCI + DESTEK/DİRENÇ BİRLEŞİMİ (CONFLUENCE)
 */
export function calculateFibSRConfluences(
  fib: FibonacciAnalysis,
  zones: SupportResistanceZone[],
  tolerancePct: number = 1.5
): FibSRConfluence[] {
  const confluences: FibSRConfluence[] = [];
  const allFibLevels = [...fib.retracements, ...fib.extensions];

  for (const f of allFibLevels) {
    for (const z of zones) {
      const zPrice = z.price ?? z.pivotPrice;
      if (!zPrice || f.price <= 0) continue;
      const discrepancyPct = Number((((zPrice - f.price) / f.price) * 100).toFixed(2));
      if (Math.abs(discrepancyPct) <= tolerancePct) {
        const absDiff = Math.abs(discrepancyPct);
        const strength: 'HIGH' | 'MEDIUM' | 'MODERATE' =
          absDiff <= 0.5 && z.strengthScore >= 70 ? 'HIGH' : absDiff <= 1.0 ? 'MEDIUM' : 'MODERATE';

        confluences.push({
          fibRatio: f.ratio,
          fibRatioFormatted: f.ratioFormatted,
          fibPrice: f.price,
          fibType: f.type,
          srZoneId: z.id,
          srPrice: zPrice,
          srType: (z.type && z.type.toUpperCase() === 'SUPPORT') || z.colorHex === '#ef4444' ? 'SUPPORT' : 'RESISTANCE',
          srStrengthScore: z.strengthScore,
          discrepancyPct,
          confluenceStrength: strength,
          note: `${f.label} (${f.price.toFixed(2)} TL) ve ${z.type === 'SUPPORT' ? 'Destek' : 'Direnç'} (${zPrice.toFixed(2)} TL) %${absDiff.toFixed(2)} sapma ile çakışmaktadır.`
        });
      }
    }
  }

  return confluences.sort((a, b) => Math.abs(a.discrepancyPct) - Math.abs(b.discrepancyPct));
}

/**
 * ÇOKLU ZAMAN DİLİMİ DİRENÇ KESİŞİM NOKTALARI (10Y, 5Y, 1Y, 1A Direnç Kesişimleri - BEYAZ #FFFFFF)
 * Uzun yıllara dayanan (10 Yıllık, 5 Yıllık, 1 Yıllık ve 1 Aylık) dirençlerin kesişim noktalarını tespit eder
 * ve grafik üzerinde Beyaz (#FFFFFF) renk ile işaretler.
 */
export function calculateMTFConfluenceZones(
  periodModels: { period: string; model: SupportResistanceModel }[],
  currentPrice: number,
  currentAtr: number,
  tolerancePct: number = 1.25,
  dataCoverage: string = ''
): MTFConfluenceZone[] {
  const levelsWithPeriod: { period: string; zone: SupportResistanceZone }[] = [];
  for (const pm of periodModels) {
    // Öncelikle dirençleri ve dirence dönüşmüş (flipped_resistance) seviyeleri al; eğer kesişim azsa yüksek güçlü tarihi tepe seviyelerini dahil et
    const resistancesOnly = pm.model.resistances.filter(r => r.type === 'RESISTANCE' || r.status === 'flipped_resistance');
    const sourceList = resistancesOnly.length > 0 ? resistancesOnly : [...pm.model.resistances, ...pm.model.supports];
    for (const z of sourceList) {
      levelsWithPeriod.push({ period: pm.period, zone: z });
    }
  }

  if (levelsWithPeriod.length === 0) return [];

  const clusters: { levels: { period: string; zone: SupportResistanceZone }[]; minP: number; maxP: number }[] = [];
  const sorted = [...levelsWithPeriod].sort((a, b) => (a.zone.price ?? 0) - (b.zone.price ?? 0));

  for (const item of sorted) {
    const p = item.zone.price ?? item.zone.pivotPrice;
    if (!p) continue;

    let merged = false;
    for (const c of clusters) {
      const avg = c.levels.reduce((sum, x) => sum + (x.zone.price ?? 0), 0) / c.levels.length;
      if (Math.abs(p - avg) / (avg || 1) <= tolerancePct / 100) {
        c.levels.push(item);
        c.minP = Math.min(c.minP, p);
        c.maxP = Math.max(c.maxP, p);
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({
        levels: [item],
        minP: p,
        maxP: p
      });
    }
  }

  const periodLabels: Record<string, string> = {
    '10y': '10 Yıllık',
    '5y': '5 Yıllık',
    '1y': '1 Yıllık',
    '1mo': '1 Aylık'
  };

  const mtfZones: MTFConfluenceZone[] = [];
  clusters.forEach((c, idx) => {
    const distinctPeriods = Array.from(new Set(c.levels.map(l => l.period)));
    if (distinctPeriods.length >= 2) {
      const avgPrice = c.levels.reduce((sum, l) => sum + (l.zone.price ?? 0), 0) / c.levels.length;
      const confluentLevels = c.levels.map(l => l.zone);
      const hasLongTerm = distinctPeriods.includes('10y') || distinctPeriods.includes('5y');
      const strengthScore = Math.min(
        100,
        distinctPeriods.length * 25 + (hasLongTerm ? 15 : 5) + Math.min(20, confluentLevels.length * 4)
      );
      const readablePeriods = distinctPeriods.map(p => periodLabels[p] || p.toUpperCase()).join(' + ');

      mtfZones.push({
        id: `mtf_res_intersection_${idx}_${avgPrice.toFixed(2).replace('.', '_')}`,
        price: Number(avgPrice.toFixed(2)),
        zoneLow: Number(c.minP.toFixed(2)),
        zoneHigh: Number(c.maxP.toFixed(2)),
        timeframes: distinctPeriods,
        periods: distinctPeriods,
        levelsCount: confluentLevels.length,
        confluentLevels,
        tolerancePct,
        dataCoverage,
        colorHex: '#ffffff', // Beyaz (#FFFFFF) Много-periyot Direnç Kesişimi
        strengthScore,
        description: `${readablePeriods} periyot dirençlerinin kesişim noktası (${confluentLevels.length} tarihsel direnç çakışması - Beyaz #FFFFFF).`
      });
    }
  });

  return mtfZones.sort((a, b) => b.strengthScore - a.strengthScore);
}

/**
 * TARİHSEL SEVİYE PERFORMANS DENETİMİ
 */
export function calculateHistoricalPerformanceReport(
  zones: SupportResistanceZone[],
  symbol: string,
  asOfDate?: string
): SRHistoricalPerformanceReport {
  let totalTouches = 0;
  let totalBounces = 0;
  let breakoutCount = 0;
  let fakeBreakoutCount = 0;
  let retestAttempts = 0;
  let successfulRetests = 0;

  for (const z of zones) {
    totalTouches += z.touchCount || 0;
    totalBounces += z.bounceCount || 0;
    if (z.status === 'broken' || z.status === 'flipped_support' || z.status === 'flipped_resistance' || z.breakoutDate) {
      breakoutCount++;
    }
    if (z.isFakeBreakout) {
      fakeBreakoutCount++;
    }
    if (z.retestCount && z.retestCount > 0) {
      retestAttempts += z.retestCount;
    }
    if (z.isRetestSuccessful || z.roleReversal === 'CONFIRMED_FLIP') {
      successfulRetests++;
    }
  }

  const bounceRatePct = totalTouches > 0 ? Number(((totalBounces / totalTouches) * 100).toFixed(2)) : 0;
  const roleReversalSuccessRatePct = retestAttempts > 0
    ? Number(((successfulRetests / retestAttempts) * 100).toFixed(2))
    : 0;

  return {
    symbol,
    asOfDate,
    totalLevelsEvaluated: zones.length,
    totalTouches,
    totalBounces,
    bounceRatePct,
    breakoutCount,
    fakeBreakoutCount,
    retestAttempts,
    successfulRetests,
    roleReversalSuccessRatePct,
    summary: `${symbol} için incelenen ${zones.length} seviyede toplam ${totalTouches} temas ve ${totalBounces} tepki (%${bounceRatePct} başarı) kaydedildi. ${retestAttempts} retest denemesinden ${successfulRetests} adedi başarılı rol değişimi teyit etti (%${roleReversalSuccessRatePct}).`
  };
}

/**
 * J. ANA DESTEK VE DİRENÇ MOTORU (calculateSupportResistanceModel)
 * Destek ve dirençleri birbirinden bağımsız hesaplar ve ayrı veri kümelerinde tutar.
 */
export function calculateSupportResistanceModel(
  ohlcv: OHLCV[],
  symbol: string = 'BIST',
  timeframe: string = '1d',
  calculationPeriod: string = '1y',
  asOfDate?: string,
  manualFibHigh?: number,
  manualFibLow?: number
): SupportResistanceModel {
  // 1. Zero Lookahead Bias: Filter candles up to asOfDate
  const effectiveCandles = filterCandlesAsOfDate(ohlcv, asOfDate);

  const validation = validateCandlesForSR(effectiveCandles, symbol, timeframe);
  const warnings = [...validation.warnings];

  if (validation.status !== 'SUCCESS') {
    return {
      supports: [],
      resistances: [],
      metadata: {
        symbol,
        timeframe,
        calculationStatus: validation.status,
        dataStatus: validation.status === 'NO_DATA' ? 'UNAVAILABLE' : 'INSUFFICIENT',
        dataSource: 'Borsa İstanbul Gerçek Veri Motoru',
        dataStartTime: validation.dataStartTime,
        dataEndTime: validation.dataEndTime,
        lastUpdatedAt: new Date().toISOString(),
        warnings,
        priceType: validation.priceType,
        nearestSupportPrice: null,
        nearestResistancePrice: null,
        nearestSupportDistancePct: null,
        nearestResistanceDistancePct: null,
        activeSupportsCount: 0,
        activeResistancesCount: 0,
        asOfDate
      }
    };
  }

  const candles = validation.validCandles;
  const currentPrice = candles[candles.length - 1].close;
  const highs = candles.map(b => b.high);
  const lows = candles.map(b => b.low);
  const closes = candles.map(b => b.close);
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const currentAtr = atrSeries[atrSeries.length - 1] || currentPrice * 0.02;

  const leftBars = timeframe === '1h' ? 4 : 3;
  const rightBars = timeframe === '1h' ? 4 : 3;
  const supportCandidates = detectPivotLows(candles, leftBars, rightBars, timeframe);
  const resistanceCandidates = detectPivotHighs(candles, leftBars, rightBars, timeframe);

  const supportClusters = clusterCandidatesIntoZones(supportCandidates, currentPrice, currentAtr, 'SUPPORT', timeframe, calculationPeriod);
  const resistanceClusters = clusterCandidatesIntoZones(resistanceCandidates, currentPrice, currentAtr, 'RESISTANCE', timeframe, calculationPeriod);

  const rawSupports = supportClusters.map(c => evaluateZoneDynamics(c, candles, currentPrice, currentAtr, 'SUPPORT', timeframe, calculationPeriod, symbol, asOfDate));
  const rawResistances = resistanceClusters.map(c => evaluateZoneDynamics(c, candles, currentPrice, currentAtr, 'RESISTANCE', timeframe, calculationPeriod, symbol, asOfDate));

  const supports = rawSupports.sort((a, b) => {
    const rank = (s: LevelStatus) => s === 'active' ? 1 : s === 'flipped_support' ? 1 : s === 'retest' ? 2 : 3;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return Math.abs(a.distancePercent) - Math.abs(b.distancePercent);
  });

  const resistances = rawResistances.sort((a, b) => {
    const rank = (s: LevelStatus) => s === 'active' ? 1 : s === 'flipped_resistance' ? 1 : s === 'retest' ? 2 : 3;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return Math.abs(a.distancePercent) - Math.abs(b.distancePercent);
  });

  if (supports.length === 0) {
    warnings.push('Bu zaman diliminde yeterli veriden doğrulanmış destek bulunamadı.');
  }
  if (resistances.length === 0) {
    warnings.push('Bu zaman diliminde yeterli veriden doğrulanmış direnç bulunamadı.');
  }

  const activeSupports = supports.filter(s => s.status === 'active' || s.status === 'flipped_support');
  const activeResistances = resistances.filter(r => r.status === 'active' || r.status === 'flipped_resistance');

  const nearestSupport = activeSupports.length > 0 ? activeSupports[0] : (supports.length > 0 ? supports[0] : null);
  const nearestResistance = activeResistances.length > 0 ? activeResistances[0] : (resistances.length > 0 ? resistances[0] : null);

  const calculationStatus: SRCalculationStatus = (supports.length > 0 || resistances.length > 0)
    ? 'SUCCESS'
    : 'NO_VALID_LEVELS';

  // 2. Fibonacci Retracement & Extension
  const fibonacci = calculateFibonacciLevels(candles, {
    manualHigh: manualFibHigh,
    manualLow: manualFibLow,
    asOfDate
  });

  // 3. Fibonacci + S/R Confluence
  const fibConfluences = calculateFibSRConfluences(fibonacci, [...supports, ...resistances], 1.5);

  // 4. Multi-Timeframe Confluence across simulated periods from available candles (10Y, 5Y, 1Y, 1M)
  let availableSpanYears = 1.0;
  if (candles.length > 1) {
    const firstTime = new Date(candles[0].dateStr || candles[0].timestamp).getTime();
    const lastTime = new Date(candles[candles.length - 1].dateStr || candles[candles.length - 1].timestamp).getTime();
    availableSpanYears = Math.max(0.1, Number(((lastTime - firstTime) / (365.25 * 24 * 3600 * 1000)).toFixed(1)));
  }

  const dataCoverage = availableSpanYears < 9.5
    ? `${availableSpanYears} Yıllık Gerçek Tarihsel Veri Kapsamı`
    : `${availableSpanYears} Yıllık Tam Tarihsel Veri Kapsamı`;

  // Period models: 1mo (last 25 bars), 1y (last 250 bars), 5y (last 1250 bars), 10y (all)
  const periodSlices = [
    { period: '1mo', count: Math.min(25, candles.length) },
    { period: '1y', count: Math.min(250, candles.length) },
    { period: '5y', count: Math.min(1250, candles.length) },
    { period: '10y', count: candles.length }
  ];

  const periodModels = periodSlices
    .filter(ps => ps.count >= 15)
    .map(ps => {
      const sliceCandles = candles.slice(-ps.count);
      const subPrice = sliceCandles[sliceCandles.length - 1].close;
      const subLeft = timeframe === '1h' ? 4 : 3;
      const subRight = timeframe === '1h' ? 4 : 3;
      const subSuppCand = detectPivotLows(sliceCandles, subLeft, subRight, timeframe);
      const subResCand = detectPivotHighs(sliceCandles, subLeft, subRight, timeframe);
      const sClusters = clusterCandidatesIntoZones(subSuppCand, subPrice, currentAtr, 'SUPPORT', timeframe, ps.period);
      const rClusters = clusterCandidatesIntoZones(subResCand, subPrice, currentAtr, 'RESISTANCE', timeframe, ps.period);
      const sZones = sClusters.map(c => evaluateZoneDynamics(c, sliceCandles, subPrice, currentAtr, 'SUPPORT', timeframe, ps.period, symbol, asOfDate));
      const rZones = rClusters.map(c => evaluateZoneDynamics(c, sliceCandles, subPrice, currentAtr, 'RESISTANCE', timeframe, ps.period, symbol, asOfDate));

      return {
        period: ps.period,
        model: {
          supports: sZones,
          resistances: rZones,
          metadata: {
            symbol,
            timeframe,
            calculationStatus: 'SUCCESS' as SRCalculationStatus,
            dataStatus: 'VERIFIED',
            dataSource: 'BIST MTF Slicer',
            dataStartTime: sliceCandles[0].dateStr,
            dataEndTime: sliceCandles[sliceCandles.length - 1].dateStr,
            lastUpdatedAt: new Date().toISOString(),
            warnings: [],
            priceType: 'HAM_FIYAT',
            activeSupportsCount: sZones.length,
            activeResistancesCount: rZones.length
          }
        }
      };
    });

  const mtfConfluences = calculateMTFConfluenceZones(periodModels, currentPrice, currentAtr, 1.25, dataCoverage);

  // 5. Historical S/R Performance Report
  const performance = calculateHistoricalPerformanceReport([...supports, ...resistances], symbol, asOfDate);

  return {
    supports,
    resistances,
    asOfDate,
    isHistoricalCutoff: Boolean(asOfDate),
    effectivePeriod: calculationPeriod,
    candlesCount: candles.length,
    dataCoverage,
    mtfConfluences,
    fibonacci,
    fibConfluences,
    performance,
    metadata: {
      symbol,
      timeframe,
      calculationStatus,
      dataStatus: 'VERIFIED',
      dataSource: 'Borsa İstanbul Gerçek Veri Motoru (Yahoo Finance Feed)',
      dataStartTime: validation.dataStartTime,
      dataEndTime: validation.dataEndTime,
      lastUpdatedAt: new Date().toISOString(),
      warnings,
      priceType: validation.priceType,
      nearestSupportPrice: nearestSupport ? nearestSupport.price : null,
      nearestResistancePrice: nearestResistance ? nearestResistance.price : null,
      nearestSupportDistancePct: nearestSupport ? nearestSupport.distancePercent : null,
      nearestResistanceDistancePct: nearestResistance ? nearestResistance.distancePercent : null,
      activeSupportsCount: activeSupports.length,
      activeResistancesCount: activeResistances.length,
      asOfDate
    }
  };
}

export function detectSupportResistanceDataset(
  ohlcv: OHLCV[],
  period: string = '5y',
  timeframe: string = '1d',
  symbol: string = 'BIST',
  asOfDate?: string
): {
  zones: SupportResistanceZone[];
  supports: SupportResistanceZone[];
  resistances: SupportResistanceZone[];
  brokenLevels: SupportResistanceZone[];
  nearestSupport: SupportResistanceZone | null;
  nearestResistance: SupportResistanceZone | null;
  model: SupportResistanceModel;
} {
  // Kural 2: Yalnızca ekranda görünen (viewport) tarih aralığına değil, tüm geçmiş fiyat verisi üzerinden
  // tarihsel ana destek, direnç ve rol değişimi (S-R Flip) seviyelerini hesapla
  const model = calculateSupportResistanceModel(ohlcv, symbol, timeframe, period, asOfDate);
  const activeSupports = model.supports.filter(s => s.status === 'active' || s.status === 'flipped_support');
  const activeResistances = model.resistances.filter(r => r.status === 'active' || r.status === 'flipped_resistance');
  const brokenLevels = [...model.supports, ...model.resistances].filter(
    l => l.status === 'broken' || l.status === 'flipped_support' || l.status === 'flipped_resistance' || l.roleReversal === 'CONFIRMED_FLIP'
  );

  const nearestSupport = activeSupports.length > 0 ? activeSupports[0] : (model.supports[0] || null);
  const nearestResistance = activeResistances.length > 0 ? activeResistances[0] : (model.resistances[0] || null);

  // Tüm tarihsel veri setindeki majör destekler, dirençler ve S-R Flip (Rol Değişimi) seviyeleri
  const historicalSupports = model.supports.slice(0, 14);
  const historicalResistances = model.resistances.slice(0, 14);
  const balanced = [...historicalSupports, ...historicalResistances].sort((a, b) => a.price - b.price);

  return {
    zones: balanced,
    supports: model.supports,
    resistances: model.resistances,
    brokenLevels,
    nearestSupport,
    nearestResistance,
    model
  };
}

export function detectSupportResistanceZones(
  ohlcv: OHLCV[],
  period: string = '5y',
  timeframe: string = '1d',
  symbol: string = 'BIST'
): SupportResistanceZone[] {
  const dataset = detectSupportResistanceDataset(ohlcv, period, timeframe, symbol);
  return dataset.zones;
}


// 18. Destek ve Direnç Kırılımları ve Fitil Taşması Ayrımı (Madde 7)
export function detectBreakouts(
  ohlcv: OHLCV[],
  zones: SupportResistanceZone[],
  timeframe: string = '1d'
): BreakoutEvent[] {
  if (!ohlcv || ohlcv.length < 5 || !zones || zones.length === 0) return [];

  const breakouts: BreakoutEvent[] = [];
  const volEmaSeries = calculateEMA(ohlcv.map(b => b.volume), 20);

  // Son 60 bar içindeki kırılımları incele
  const startIdx = Math.max(1, ohlcv.length - 60);

  for (const zone of zones) {
    for (let i = startIdx; i < ohlcv.length; i++) {
      const prevBar = ohlcv[i - 1];
      const curBar = ohlcv[i];
      const volEma = volEmaSeries[i] || 1;
      const volumeRatio = Number((curBar.volume / volEma).toFixed(2));
      const volumeConfirmed = volumeRatio >= 1.2;

      // Direnç Kırılımı Kontrolü
      if (zone.type === 'RESISTANCE') {
        if (prevBar.close <= zone.priceHigh) {
          if (curBar.high > zone.priceHigh && curBar.close <= zone.priceHigh) {
            breakouts.push({
              id: `bk_wick_${zone.id}_${i}`,
              date: curBar.dateStr,
              dateStr: curBar.dateStr,
              priceLevel: zone.pivotPrice,
              levelPrice: zone.pivotPrice,
              direction: 'BULLISH_BREAKOUT',
              timeframe,
              closeConfirmed: false,
              wickPenetrationOnly: true,
              volumeConfirmed,
              hasVolumeConfirmation: volumeConfirmed,
              volumeRatio,
              subsequentMovePct: calculateSubsequentMove(ohlcv, i, 3)
            });
          } else if (curBar.close > zone.priceHigh) {
            breakouts.push({
              id: `bk_conf_${zone.id}_${i}`,
              date: curBar.dateStr,
              dateStr: curBar.dateStr,
              priceLevel: zone.pivotPrice,
              levelPrice: zone.pivotPrice,
              direction: 'BULLISH_BREAKOUT',
              timeframe,
              closeConfirmed: true,
              wickPenetrationOnly: false,
              volumeConfirmed,
              hasVolumeConfirmation: volumeConfirmed,
              volumeRatio,
              subsequentMovePct: calculateSubsequentMove(ohlcv, i, 3)
            });
          }
        }
      }

      // Destek Kırılımı Kontrolü
      if (zone.type === 'SUPPORT') {
        if (prevBar.close >= zone.priceLow) {
          if (curBar.low < zone.priceLow && curBar.close >= zone.priceLow) {
            breakouts.push({
              id: `bk_wick_${zone.id}_${i}`,
              date: curBar.dateStr,
              dateStr: curBar.dateStr,
              priceLevel: zone.pivotPrice,
              levelPrice: zone.pivotPrice,
              direction: 'BEARISH_BREAKOUT',
              timeframe,
              closeConfirmed: false,
              wickPenetrationOnly: true,
              volumeConfirmed,
              hasVolumeConfirmation: volumeConfirmed,
              volumeRatio,
              subsequentMovePct: calculateSubsequentMove(ohlcv, i, 3)
            });
          } else if (curBar.close < zone.priceLow) {
            breakouts.push({
              id: `bk_conf_${zone.id}_${i}`,
              date: curBar.dateStr,
              dateStr: curBar.dateStr,
              priceLevel: zone.pivotPrice,
              levelPrice: zone.pivotPrice,
              direction: 'BEARISH_BREAKOUT',
              timeframe,
              closeConfirmed: true,
              wickPenetrationOnly: false,
              volumeConfirmed,
              hasVolumeConfirmation: volumeConfirmed,
              volumeRatio,
              subsequentMovePct: calculateSubsequentMove(ohlcv, i, 3)
            });
          }
        }
      }
    }
  }

  return breakouts.sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 10);
}

function calculateSubsequentMove(ohlcv: OHLCV[], idx: number, barsAhead: number = 3): number {
  const targetIdx = Math.min(ohlcv.length - 1, idx + barsAhead);
  if (targetIdx <= idx) return 0;
  const initial = ohlcv[idx].close;
  const subsequent = ohlcv[targetIdx].close;
  return Number((((subsequent - initial) / initial) * 100).toFixed(2));
}

// 19. Otomatik Formasyon Tarayıcı (Tüm Klasik ve Modern Formasyonlar + Grafik Çizim Noktaları keyPoints)
export function detectChartPatterns(ohlcv: OHLCV[], timeframe: string = '1d'): ChartPattern[] {
  if (!ohlcv || ohlcv.length < 25) return [];

  const patterns: ChartPattern[] = [];
  const closes = ohlcv.map(b => b.close);
  const highs = ohlcv.map(b => b.high);
  const lows = ohlcv.map(b => b.low);
  const currentPrice = closes[closes.length - 1];
  const atr = calculateATR(highs, lows, closes, 14);
  const currentAtr = atr[atr.length - 1] || currentPrice * 0.02;

  const windowSize = Math.min(60, ohlcv.length);
  const baseIdx = ohlcv.length - windowSize;
  const sliceLows = lows.slice(-windowSize);
  const sliceHighs = highs.slice(-windowSize);
  const sliceCloses = closes.slice(-windowSize);
  const startCandleDate = ohlcv[baseIdx].dateStr;

  const pt = (localIdx: number, price: number, label: string) => {
    const absIdx = Math.max(0, Math.min(ohlcv.length - 1, baseIdx + localIdx));
    return {
      label,
      price: Number(price.toFixed(2)),
      dateStr: ohlcv[absIdx].dateStr,
      barIndex: absIdx
    };
  };

  const findLocalMin = (arr: number[], start: number, end: number) => {
    let minVal = Infinity;
    let minIdx = start;
    for (let i = Math.max(0, start); i < Math.min(arr.length, end); i++) {
      if (arr[i] < minVal) {
        minVal = arr[i];
        minIdx = i;
      }
    }
    return { val: minVal, idx: minIdx };
  };

  const findLocalMax = (arr: number[], start: number, end: number) => {
    let maxVal = -Infinity;
    let maxIdx = start;
    for (let i = Math.max(0, start); i < Math.min(arr.length, end); i++) {
      if (arr[i] > maxVal) {
        maxVal = arr[i];
        maxIdx = i;
      }
    }
    return { val: maxVal, idx: maxIdx };
  };

  // 1. İkili Dip (Double Bottom - W)
  const halfWin = Math.floor(windowSize / 2);
  const dbLow1 = findLocalMin(sliceLows, 0, halfWin);
  const dbLow2 = findLocalMin(sliceLows, halfWin, windowSize);
  if (dbLow2.idx - dbLow1.idx >= 6) {
    const diffPct = Math.abs(dbLow1.val - dbLow2.val) / (dbLow1.val || 1);
    if (diffPct <= 0.035) {
      const midPeak = findLocalMax(sliceHighs, dbLow1.idx, dbLow2.idx + 1);
      const height = midPeak.val - Math.min(dbLow1.val, dbLow2.val);
      if (height > currentAtr * 0.9) {
        const isConfirmed = currentPrice >= midPeak.val;
        patterns.push({
          id: 'pat_double_bottom',
          type: 'DOUBLE_BOTTOM',
          turkishName: 'Çift Dip (Double Bottom - W)',
          bias: 'BULLISH',
          status: isConfirmed ? 'CONFIRMED' : 'FORMING',
          necklinePrice: Number(midPeak.val.toFixed(2)),
          targetPrice: Number((midPeak.val + height).toFixed(2)),
          stopLossPrice: Number((Math.min(dbLow1.val, dbLow2.val) - currentAtr * 0.4).toFixed(2)),
          confidenceScore: isConfirmed ? 88 : 74,
          description: `1. Dip: ${dbLow1.val.toFixed(2)} TL, 2. Dip: ${dbLow2.val.toFixed(2)} TL. Boyun direnci: ${midPeak.val.toFixed(2)} TL.`,
          detectedIndex: baseIdx + dbLow2.idx,
          startDate: ohlcv[baseIdx + dbLow1.idx].dateStr,
          boundaries: { upper: midPeak.val, lower: Math.min(dbLow1.val, dbLow2.val) },
          invalidationCondition: `${(Math.min(dbLow1.val, dbLow2.val) - currentAtr * 0.4).toFixed(2)} TL altı kapanış`,
          timeframe,
          keyPoints: [
            pt(Math.max(0, dbLow1.idx - 4), sliceHighs[Math.max(0, dbLow1.idx - 4)], 'Giriş'),
            pt(dbLow1.idx, dbLow1.val, '1. Dip'),
            pt(midPeak.idx, midPeak.val, 'Boyun'),
            pt(dbLow2.idx, dbLow2.val, '2. Dip'),
            pt(windowSize - 1, currentPrice, isConfirmed ? 'Kırılım' : 'Son Fiyat')
          ]
        });
      }
    }
  }

  // 2. İkili Tepe (Double Top - M)
  const dtHigh1 = findLocalMax(sliceHighs, 0, halfWin);
  const dtHigh2 = findLocalMax(sliceHighs, halfWin, windowSize);
  if (dtHigh2.idx - dtHigh1.idx >= 6) {
    const diffPct = Math.abs(dtHigh1.val - dtHigh2.val) / (dtHigh1.val || 1);
    if (diffPct <= 0.035) {
      const midTrough = findLocalMin(sliceLows, dtHigh1.idx, dtHigh2.idx + 1);
      const height = Math.max(dtHigh1.val, dtHigh2.val) - midTrough.val;
      if (height > currentAtr * 0.9) {
        const isConfirmed = currentPrice <= midTrough.val;
        patterns.push({
          id: 'pat_double_top',
          type: 'DOUBLE_TOP',
          turkishName: 'Çift Tepe (Double Top - M)',
          bias: 'BEARISH',
          status: isConfirmed ? 'CONFIRMED' : 'FORMING',
          necklinePrice: Number(midTrough.val.toFixed(2)),
          targetPrice: Number((midTrough.val - height).toFixed(2)),
          stopLossPrice: Number((Math.max(dtHigh1.val, dtHigh2.val) + currentAtr * 0.4).toFixed(2)),
          confidenceScore: isConfirmed ? 86 : 72,
          description: `1. Tepe: ${dtHigh1.val.toFixed(2)} TL, 2. Tepe: ${dtHigh2.val.toFixed(2)} TL. Boyun desteği: ${midTrough.val.toFixed(2)} TL.`,
          detectedIndex: baseIdx + dtHigh2.idx,
          startDate: ohlcv[baseIdx + dtHigh1.idx].dateStr,
          boundaries: { upper: Math.max(dtHigh1.val, dtHigh2.val), lower: midTrough.val },
          invalidationCondition: `${(Math.max(dtHigh1.val, dtHigh2.val) + currentAtr * 0.4).toFixed(2)} TL üzeri kapanış`,
          timeframe,
          keyPoints: [
            pt(Math.max(0, dtHigh1.idx - 4), sliceLows[Math.max(0, dtHigh1.idx - 4)], 'Giriş'),
            pt(dtHigh1.idx, dtHigh1.val, '1. Tepe'),
            pt(midTrough.idx, midTrough.val, 'Boyun'),
            pt(dtHigh2.idx, dtHigh2.val, '2. Tepe'),
            pt(windowSize - 1, currentPrice, isConfirmed ? 'Kırılım' : 'Son Fiyat')
          ]
        });
      }
    }
  }

  // Son 30 bar üzerinde üçgen ve kama analizleri
  const triOffset = Math.max(0, windowSize - 30);
  const triL1 = findLocalMin(sliceLows, triOffset, triOffset + 10);
  const triL2 = findLocalMin(sliceLows, triOffset + 10, triOffset + 20);
  const triL3 = findLocalMin(sliceLows, triOffset + 20, windowSize);
  const triH1 = findLocalMax(sliceHighs, triOffset, triOffset + 10);
  const triH2 = findLocalMax(sliceHighs, triOffset + 10, triOffset + 20);
  const triH3 = findLocalMax(sliceHighs, triOffset + 20, windowSize);

  // 3. Yükselen Üçgen (Ascending Triangle)
  if (triL3.val > triL2.val && triL2.val > triL1.val && Math.abs(triH1.val - triH3.val) / (triH1.val || 1) <= 0.025) {
    const resistance = Math.max(triH1.val, triH2.val, triH3.val);
    const height = resistance - triL1.val;
    const isConfirmed = currentPrice > resistance;
    patterns.push({
      id: 'pat_asc_triangle',
      type: 'ASCENDING_TRIANGLE',
      turkishName: 'Yükselen Üçgen',
      bias: 'BULLISH',
      status: isConfirmed ? 'CONFIRMED' : 'FORMING',
      necklinePrice: Number(resistance.toFixed(2)),
      targetPrice: Number((resistance + height).toFixed(2)),
      stopLossPrice: Number((triL3.val - currentAtr * 0.3).toFixed(2)),
      confidenceScore: isConfirmed ? 89 : 76,
      description: `Yükselen dipler (${triL1.val.toFixed(2)} → ${triL3.val.toFixed(2)} TL) yatay ${resistance.toFixed(2)} TL direncini sıkıştırmaktadır.`,
      detectedIndex: ohlcv.length - 1,
      startDate: ohlcv[baseIdx + triL1.idx].dateStr,
      boundaries: { upper: resistance, lower: triL3.val },
      invalidationCondition: `${triL3.val.toFixed(2)} TL destek altı kapanış`,
      timeframe,
      keyPoints: [
        pt(triL1.idx, triL1.val, 'Dip 1'),
        pt(triH1.idx, resistance, 'Direnç 1'),
        pt(triL2.idx, triL2.val, 'Dip 2'),
        pt(triH3.idx, resistance, 'Direnç 2'),
        pt(triL3.idx, triL3.val, 'Dip 3'),
        pt(windowSize - 1, currentPrice, 'Sıkışma Ucu')
      ]
    });
  }

  // 4. Alçalan / Düşen Üçgen (Descending Triangle)
  if (triH3.val < triH2.val && triH2.val < triH1.val && Math.abs(triL1.val - triL3.val) / (triL1.val || 1) <= 0.025) {
    const support = Math.min(triL1.val, triL2.val, triL3.val);
    const height = triH1.val - support;
    const isConfirmed = currentPrice < support;
    patterns.push({
      id: 'pat_desc_triangle',
      type: 'DESCENDING_TRIANGLE',
      turkishName: 'Alçalan Üçgen',
      bias: 'BEARISH',
      status: isConfirmed ? 'CONFIRMED' : 'FORMING',
      necklinePrice: Number(support.toFixed(2)),
      targetPrice: Number((support - height).toFixed(2)),
      stopLossPrice: Number((triH3.val + currentAtr * 0.3).toFixed(2)),
      confidenceScore: isConfirmed ? 86 : 73,
      description: `Alçalan tepeler (${triH1.val.toFixed(2)} → ${triH3.val.toFixed(2)} TL) yatay ${support.toFixed(2)} TL desteğini baskılamaktadır.`,
      detectedIndex: ohlcv.length - 1,
      startDate: ohlcv[baseIdx + triH1.idx].dateStr,
      boundaries: { upper: triH3.val, lower: support },
      invalidationCondition: `${triH3.val.toFixed(2)} TL üzeri kapanış`,
      timeframe,
      keyPoints: [
        pt(triH1.idx, triH1.val, 'Tepe 1'),
        pt(triL1.idx, support, 'Destek 1'),
        pt(triH2.idx, triH2.val, 'Tepe 2'),
        pt(triL3.idx, support, 'Destek 2'),
        pt(triH3.idx, triH3.val, 'Tepe 3'),
        pt(windowSize - 1, currentPrice, 'Sıkışma Ucu')
      ]
    });
  }

  // 5. Simetrik Üçgen (Symmetrical Triangle)
  if (triH3.val < triH1.val && triL3.val > triL1.val && (triH1.val - triH3.val) / (triH1.val || 1) >= 0.015 && (triL3.val - triL1.val) / (triL1.val || 1) >= 0.015) {
    const height = triH1.val - triL1.val;
    const midPrice = (triH3.val + triL3.val) / 2;
    const isBull = currentPrice >= midPrice;
    patterns.push({
      id: 'pat_sym_triangle',
      type: 'SYMMETRICAL_TRIANGLE',
      turkishName: 'Simetrik Üçgen',
      bias: isBull ? 'BULLISH' : 'BEARISH',
      status: currentPrice > triH3.val || currentPrice < triL3.val ? 'CONFIRMED' : 'FORMING',
      necklinePrice: Number((isBull ? triH3.val : triL3.val).toFixed(2)),
      targetPrice: Number((isBull ? triH3.val + height * 0.75 : triL3.val - height * 0.75).toFixed(2)),
      stopLossPrice: Number(midPrice.toFixed(2)),
      confidenceScore: 78,
      description: `Alçalan üst direnç (${triH1.val.toFixed(2)} → ${triH3.val.toFixed(2)} TL) ve yükselen alt destek (${triL1.val.toFixed(2)} → ${triL3.val.toFixed(2)} TL) simetrik üçgen sıkışması oluşturmaktadır.`,
      detectedIndex: ohlcv.length - 1,
      startDate: ohlcv[baseIdx + Math.min(triH1.idx, triL1.idx)].dateStr,
      boundaries: { upper: triH3.val, lower: triL3.val },
      invalidationCondition: `Üçgen apeksi dışına ters yönde kırılım`,
      timeframe,
      keyPoints: [
        pt(triH1.idx, triH1.val, 'Üst 1'),
        pt(triL1.idx, triL1.val, 'Alt 1'),
        pt(triH2.idx, triH2.val, 'Üst 2'),
        pt(triL2.idx, triL2.val, 'Alt 2'),
        pt(triH3.idx, triH3.val, 'Üst 3'),
        pt(triL3.idx, triL3.val, 'Alt 3'),
        pt(windowSize - 1, currentPrice, 'Apeks')
      ]
    });
  }

  // 6. TOBO (Ters Omuz Baş Omuz / Inverse Head and Shoulders)
  if (windowSize >= 30) {
    const third = Math.floor(windowSize / 3);
    const ls = findLocalMin(sliceLows, 0, third);
    const head = findLocalMin(sliceLows, third, third * 2);
    const rs = findLocalMin(sliceLows, third * 2, windowSize);
    if (head.val < ls.val && head.val < rs.val && Math.abs(ls.val - rs.val) / (ls.val || 1) <= 0.05) {
      const neck1 = findLocalMax(sliceHighs, ls.idx, head.idx + 1);
      const neck2 = findLocalMax(sliceHighs, head.idx, rs.idx + 1);
      const neckline = (neck1.val + neck2.val) / 2;
      const height = neckline - head.val;
      const isConfirmed = currentPrice >= neckline;
      patterns.push({
        id: 'pat_tobo',
        type: 'INVERSE_HEAD_AND_SHOULDERS',
        turkishName: 'TOBO (Ters Omuz Baş Omuz)',
        bias: 'BULLISH',
        status: isConfirmed ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(neckline.toFixed(2)),
        targetPrice: Number((neckline + height).toFixed(2)),
        stopLossPrice: Number((rs.val - currentAtr * 0.35).toFixed(2)),
        confidenceScore: isConfirmed ? 91 : 78,
        description: `Sol Omuz: ${ls.val.toFixed(2)} TL, Baş: ${head.val.toFixed(2)} TL, Sağ Omuz: ${rs.val.toFixed(2)} TL. Boyun hattı: ${neckline.toFixed(2)} TL.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + ls.idx].dateStr,
        boundaries: { upper: neckline, lower: head.val },
        invalidationCondition: `${rs.val.toFixed(2)} TL sağ omuz altı kapanış`,
        timeframe,
        keyPoints: [
          pt(ls.idx, ls.val, 'Sol Omuz'),
          pt(neck1.idx, neck1.val, 'Boyun 1'),
          pt(head.idx, head.val, 'Baş'),
          pt(neck2.idx, neck2.val, 'Boyun 2'),
          pt(rs.idx, rs.val, 'Sağ Omuz'),
          pt(windowSize - 1, currentPrice, isConfirmed ? 'Boyun Kırılımı' : 'Son Fiyat')
        ]
      });
    }
  }

  // 7. OBO (Omuz Baş Omuz / Head and Shoulders)
  if (windowSize >= 30) {
    const third = Math.floor(windowSize / 3);
    const ls = findLocalMax(sliceHighs, 0, third);
    const head = findLocalMax(sliceHighs, third, third * 2);
    const rs = findLocalMax(sliceHighs, third * 2, windowSize);
    if (head.val > ls.val && head.val > rs.val && Math.abs(ls.val - rs.val) / (ls.val || 1) <= 0.05) {
      const neck1 = findLocalMin(sliceLows, ls.idx, head.idx + 1);
      const neck2 = findLocalMin(sliceLows, head.idx, rs.idx + 1);
      const neckline = (neck1.val + neck2.val) / 2;
      const height = head.val - neckline;
      const isConfirmed = currentPrice <= neckline;
      patterns.push({
        id: 'pat_obo',
        type: 'HEAD_AND_SHOULDERS',
        turkishName: 'OBO (Omuz Baş Omuz)',
        bias: 'BEARISH',
        status: isConfirmed ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(neckline.toFixed(2)),
        targetPrice: Number((neckline - height).toFixed(2)),
        stopLossPrice: Number((rs.val + currentAtr * 0.35).toFixed(2)),
        confidenceScore: isConfirmed ? 89 : 76,
        description: `Sol Omuz: ${ls.val.toFixed(2)} TL, Baş: ${head.val.toFixed(2)} TL, Sağ Omuz: ${rs.val.toFixed(2)} TL. Boyun desteği: ${neckline.toFixed(2)} TL.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + ls.idx].dateStr,
        boundaries: { upper: head.val, lower: neckline },
        invalidationCondition: `${rs.val.toFixed(2)} TL sağ omuz üzeri kapanış`,
        timeframe,
        keyPoints: [
          pt(ls.idx, ls.val, 'Sol Omuz'),
          pt(neck1.idx, neck1.val, 'Boyun 1'),
          pt(head.idx, head.val, 'Baş'),
          pt(neck2.idx, neck2.val, 'Boyun 2'),
          pt(rs.idx, rs.val, 'Sağ Omuz'),
          pt(windowSize - 1, currentPrice, isConfirmed ? 'Boyun Kırılımı' : 'Son Fiyat')
        ]
      });
    }
  }

  // 8. Üçlü Dip (Triple Bottom)
  if (windowSize >= 30) {
    const third = Math.floor(windowSize / 3);
    const lA = findLocalMin(sliceLows, 0, third);
    const lB = findLocalMin(sliceLows, third, third * 2);
    const lC = findLocalMin(sliceLows, third * 2, windowSize);
    if (Math.abs(lA.val - lB.val) / (lA.val || 1) <= 0.025 && Math.abs(lB.val - lC.val) / (lB.val || 1) <= 0.025) {
      const peak = findLocalMax(sliceHighs, lA.idx, lC.idx + 1);
      const height = peak.val - lB.val;
      const isConfirmed = currentPrice >= peak.val;
      patterns.push({
        id: 'pat_triple_bottom',
        type: 'TRIPLE_BOTTOM',
        turkishName: 'Üçlü Dip (Triple Bottom)',
        bias: 'BULLISH',
        status: isConfirmed ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(peak.val.toFixed(2)),
        targetPrice: Number((peak.val + height).toFixed(2)),
        stopLossPrice: Number((Math.min(lA.val, lB.val, lC.val) - currentAtr * 0.4).toFixed(2)),
        confidenceScore: isConfirmed ? 89 : 74,
        description: `Üç güçlü dip (${lA.val.toFixed(2)}, ${lB.val.toFixed(2)}, ${lC.val.toFixed(2)} TL) kurumsal taban oluşturmuştur.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + lA.idx].dateStr,
        boundaries: { upper: peak.val, lower: lB.val },
        invalidationCondition: `${lB.val.toFixed(2)} TL taban altı kapanış`,
        timeframe,
        keyPoints: [
          pt(lA.idx, lA.val, '1. Dip'),
          pt(lB.idx, lB.val, '2. Dip'),
          pt(lC.idx, lC.val, '3. Dip'),
          pt(windowSize - 1, currentPrice, 'Son Fiyat')
        ]
      });
    }
  }

  // 9. Üçlü Tepe (Triple Top)
  if (windowSize >= 30) {
    const third = Math.floor(windowSize / 3);
    const hA = findLocalMax(sliceHighs, 0, third);
    const hB = findLocalMax(sliceHighs, third, third * 2);
    const hC = findLocalMax(sliceHighs, third * 2, windowSize);
    if (Math.abs(hA.val - hB.val) / (hA.val || 1) <= 0.025 && Math.abs(hB.val - hC.val) / (hB.val || 1) <= 0.025) {
      const trough = findLocalMin(sliceLows, hA.idx, hC.idx + 1);
      const height = hB.val - trough.val;
      const isConfirmed = currentPrice <= trough.val;
      patterns.push({
        id: 'pat_triple_top',
        type: 'TRIPLE_TOP',
        turkishName: 'Üçlü Tepe (Triple Top)',
        bias: 'BEARISH',
        status: isConfirmed ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(trough.val.toFixed(2)),
        targetPrice: Number((trough.val - height).toFixed(2)),
        stopLossPrice: Number((Math.max(hA.val, hB.val, hC.val) + currentAtr * 0.4).toFixed(2)),
        confidenceScore: isConfirmed ? 87 : 72,
        description: `Üç güçlü tepe (${hA.val.toFixed(2)}, ${hB.val.toFixed(2)}, ${hC.val.toFixed(2)} TL) aşılamayan direnç oluşturmuştur.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + hA.idx].dateStr,
        boundaries: { upper: hB.val, lower: trough.val },
        invalidationCondition: `${hB.val.toFixed(2)} TL tepe üstü kapanış`,
        timeframe,
        keyPoints: [
          pt(hA.idx, hA.val, '1. Tepe'),
          pt(hB.idx, hB.val, '2. Tepe'),
          pt(hC.idx, hC.val, '3. Tepe'),
          pt(windowSize - 1, currentPrice, 'Son Fiyat')
        ]
      });
    }
  }

  // 10. Alçalan / Düşen Kama (Falling Wedge)
  if (triH3.val < triH1.val && triL3.val < triL1.val) {
    const highDrop = triH1.val - triH3.val;
    const lowDrop = triL1.val - triL3.val;
    if (highDrop > lowDrop * 1.15 && lowDrop > 0) {
      patterns.push({
        id: 'pat_falling_wedge',
        type: 'FALLING_WEDGE',
        turkishName: 'Alçalan Kama (Falling Wedge)',
        bias: 'BULLISH',
        status: currentPrice > triH3.val ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(triH3.val.toFixed(2)),
        targetPrice: Number(triH1.val.toFixed(2)),
        stopLossPrice: Number((triL3.val - currentAtr * 0.3).toFixed(2)),
        confidenceScore: 80,
        description: `Fiyat daralan alçalan kama içinde sıkışarak yukarı yönlü boğa dönüş potansiyeli biriktirmektedir.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + triH1.idx].dateStr,
        boundaries: { upper: triH3.val, lower: triL3.val },
        invalidationCondition: `${triL3.val.toFixed(2)} TL kama alt bandı kırılımı`,
        timeframe,
        keyPoints: [
          pt(triH1.idx, triH1.val, 'Kama Üst 1'),
          pt(triL1.idx, triL1.val, 'Kama Alt 1'),
          pt(triH2.idx, triH2.val, 'Kama Üst 2'),
          pt(triL3.idx, triL3.val, 'Kama Alt 2'),
          pt(triH3.idx, triH3.val, 'Kama Direnci'),
          pt(windowSize - 1, currentPrice, 'Son')
        ]
      });
    }
  }

  // 11. Yükselen Kama (Rising Wedge)
  if (triH3.val > triH1.val && triL3.val > triL1.val) {
    const lowRise = triL3.val - triL1.val;
    const highRise = triH3.val - triH1.val;
    if (lowRise > highRise * 1.15 && highRise > 0) {
      patterns.push({
        id: 'pat_rising_wedge',
        type: 'RISING_WEDGE',
        turkishName: 'Yükselen Kama (Rising Wedge)',
        bias: 'BEARISH',
        status: currentPrice < triL3.val ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(triL3.val.toFixed(2)),
        targetPrice: Number(triL1.val.toFixed(2)),
        stopLossPrice: Number((triH3.val + currentAtr * 0.3).toFixed(2)),
        confidenceScore: 77,
        description: `Fiyat daralan yükselen kama içinde momentum kaybetmekte olup destek kırılımına karşı dikkatli olunmalıdır.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + triL1.idx].dateStr,
        boundaries: { upper: triH3.val, lower: triL3.val },
        invalidationCondition: `${triH3.val.toFixed(2)} TL üzeri kapanış`,
        timeframe,
        keyPoints: [
          pt(triL1.idx, triL1.val, 'Kama Alt 1'),
          pt(triH1.idx, triH1.val, 'Kama Üst 1'),
          pt(triL2.idx, triL2.val, 'Kama Alt 2'),
          pt(triH3.idx, triH3.val, 'Kama Üst 2'),
          pt(triL3.idx, triL3.val, 'Kama Desteği'),
          pt(windowSize - 1, currentPrice, 'Son')
        ]
      });
    }
  }

  // 12. Boğa Bayrağı (Bull Flag) & Ayı Bayrağı (Bear Flag) & Flama (Pennant)
  const poleStartIdx = Math.max(0, windowSize - 22);
  const poleEndIdx = Math.max(5, windowSize - 10);
  const poleMove = (sliceCloses[poleEndIdx] - sliceCloses[poleStartIdx]) / (sliceCloses[poleStartIdx] || 1);
  const flagSliceCloses = sliceCloses.slice(poleEndIdx + 1);
  if (flagSliceCloses.length >= 5) {
    const maxFlag = Math.max(...flagSliceCloses);
    const minFlag = Math.min(...flagSliceCloses);
    const flagRange = (maxFlag - minFlag) / (minFlag || 1);

    if (poleMove >= 0.055 && flagRange <= 0.048) {
      const poleHeight = sliceCloses[poleEndIdx] - sliceCloses[poleStartIdx];
      patterns.push({
        id: 'pat_bull_flag',
        type: 'BULL_FLAG',
        turkishName: 'Boğa Bayrağı (Bull Flag)',
        bias: 'BULLISH',
        status: currentPrice >= maxFlag ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(maxFlag.toFixed(2)),
        targetPrice: Number((maxFlag + poleHeight).toFixed(2)),
        stopLossPrice: Number((minFlag - currentAtr * 0.4).toFixed(2)),
        confidenceScore: 84,
        description: `Güçlü bayrak direği (+%${(poleMove * 100).toFixed(1)}) sonrasında ${minFlag.toFixed(2)}-${maxFlag.toFixed(2)} TL bandında bayrak konsolidasyonu.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + poleStartIdx].dateStr,
        boundaries: { upper: maxFlag, lower: minFlag },
        invalidationCondition: `${minFlag.toFixed(2)} TL bayrak alt bandı kırılımı`,
        timeframe,
        keyPoints: [
          pt(poleStartIdx, sliceCloses[poleStartIdx], 'Direk Dip'),
          pt(poleEndIdx, sliceCloses[poleEndIdx], 'Direk Tepe'),
          pt(poleEndIdx + 3, minFlag, 'Bayrak Alt'),
          pt(windowSize - 1, currentPrice, 'Bayrak Ucu')
        ]
      });
    } else if (poleMove <= -0.055 && flagRange <= 0.048) {
      const poleDrop = sliceCloses[poleStartIdx] - sliceCloses[poleEndIdx];
      patterns.push({
        id: 'pat_bear_flag',
        type: 'BEAR_FLAG',
        turkishName: 'Ayı Bayrağı (Bear Flag)',
        bias: 'BEARISH',
        status: currentPrice <= minFlag ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(minFlag.toFixed(2)),
        targetPrice: Number(Math.max(0.01, minFlag - poleDrop).toFixed(2)),
        stopLossPrice: Number((maxFlag + currentAtr * 0.4).toFixed(2)),
        confidenceScore: 81,
        description: `Sert düşüş direği (%${(poleMove * 100).toFixed(1)}) sonrası zayıf tepki bayrağı.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + poleStartIdx].dateStr,
        boundaries: { upper: maxFlag, lower: minFlag },
        invalidationCondition: `${maxFlag.toFixed(2)} TL üzeri kapanış`,
        timeframe,
        keyPoints: [
          pt(poleStartIdx, sliceCloses[poleStartIdx], 'Direk Tepe'),
          pt(poleEndIdx, sliceCloses[poleEndIdx], 'Direk Dip'),
          pt(poleEndIdx + 3, maxFlag, 'Bayrak Üst'),
          pt(windowSize - 1, currentPrice, 'Bayrak Ucu')
        ]
      });
    }

    if (poleMove >= 0.055 && maxFlag - minFlag <= currentAtr * 1.8) {
      const poleHeight = sliceCloses[poleEndIdx] - sliceCloses[poleStartIdx];
      patterns.push({
        id: 'pat_pennant',
        type: 'PENNANT',
        turkishName: 'Flama Formasyonu (Pennant)',
        bias: 'BULLISH',
        status: currentPrice >= maxFlag ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(maxFlag.toFixed(2)),
        targetPrice: Number((maxFlag + poleHeight).toFixed(2)),
        stopLossPrice: Number((minFlag - currentAtr * 0.4).toFixed(2)),
        confidenceScore: 82,
        description: `İvmeli yükseliş direği ardından daralan üçgen flama sıkışması.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + poleStartIdx].dateStr,
        boundaries: { upper: maxFlag, lower: minFlag },
        invalidationCondition: `${minFlag.toFixed(2)} TL altı kapanış`,
        timeframe,
        keyPoints: [
          pt(poleStartIdx, sliceCloses[poleStartIdx], 'Direk Dip'),
          pt(poleEndIdx, sliceCloses[poleEndIdx], 'Flama Tepe'),
          pt(poleEndIdx + 3, minFlag, 'Flama Alt'),
          pt(windowSize - 1, currentPrice, 'Flama Ucu')
        ]
      });
    }
  }

  // 14. Fincan-Kulp (Cup and Handle - CUP_AND_HANDLE)
  if (windowSize >= 35) {
    const cupEnd = Math.floor(windowSize * 0.78);
    const leftLip = findLocalMax(sliceHighs, 0, Math.floor(cupEnd * 0.25));
    const cupBottom = findLocalMin(sliceLows, Math.floor(cupEnd * 0.25), Math.floor(cupEnd * 0.75));
    const rightLip = findLocalMax(sliceHighs, Math.floor(cupEnd * 0.75), cupEnd);
    const handleLow = findLocalMin(sliceLows, cupEnd, windowSize);

    const lipDiffPct = Math.abs(leftLip.val - rightLip.val) / (leftLip.val || 1);
    const cupDepth = Math.min(leftLip.val, rightLip.val) - cupBottom.val;
    const handleDepth = rightLip.val - handleLow.val;

    if (
      lipDiffPct <= 0.045 &&
      cupDepth > currentAtr * 1.4 &&
      handleDepth > 0 &&
      handleDepth <= cupDepth * 0.55
    ) {
      const neckline = Math.max(leftLip.val, rightLip.val);
      const isConfirmed = currentPrice >= neckline;
      patterns.push({
        id: 'pat_cup_and_handle',
        type: 'CUP_AND_HANDLE',
        turkishName: 'Fincan-Kulp (Cup & Handle)',
        bias: 'BULLISH',
        status: isConfirmed ? 'CONFIRMED' : 'FORMING',
        necklinePrice: Number(neckline.toFixed(2)),
        targetPrice: Number((neckline + cupDepth).toFixed(2)),
        stopLossPrice: Number((handleLow.val - currentAtr * 0.35).toFixed(2)),
        confidenceScore: isConfirmed ? 90 : 81,
        description: `Fincan tabanı: ${cupBottom.val.toFixed(2)} TL, Kulp desteği: ${handleLow.val.toFixed(2)} TL, Boyun (Rim) direnci: ${neckline.toFixed(2)} TL.`,
        detectedIndex: ohlcv.length - 1,
        startDate: ohlcv[baseIdx + leftLip.idx].dateStr,
        boundaries: { upper: neckline, lower: cupBottom.val },
        invalidationCondition: `${handleLow.val.toFixed(2)} TL kulp desteği altı kapanış`,
        timeframe,
        keyPoints: [
          pt(leftLip.idx, leftLip.val, 'Sol Kenar'),
          pt(cupBottom.idx, cupBottom.val, 'Fincan Dibi'),
          pt(rightLip.idx, rightLip.val, 'Sağ Kenar'),
          pt(handleLow.idx, handleLow.val, 'Kulp Dibi'),
          pt(windowSize - 1, currentPrice, isConfirmed ? 'Kulp Kırılımı' : 'Son Fiyat')
        ]
      });
    }
  }

  // 15. Harmonik Formasyonlar (XABCD — Gartley / Bat / Butterfly / ABCD)
  if (windowSize >= 32) {
    const seg = Math.floor(windowSize / 4);
    const pX = findLocalMin(sliceLows, 0, seg);
    const pA = findLocalMax(sliceHighs, seg, seg * 2);
    const pB = findLocalMin(sliceLows, seg * 2, seg * 3);
    const pC = findLocalMax(sliceHighs, seg * 3, windowSize - 3);
    const pD = { val: currentPrice, idx: windowSize - 1 };

    const xa = pA.val - pX.val;
    const ab = pA.val - pB.val;
    const bc = pC.val - pB.val;
    const cd = pC.val - pD.val;

    if (xa > currentAtr * 1.2 && ab > 0 && bc > 0 && cd > 0) {
      const abXaRatio = ab / xa;
      const adXaRatio = (pA.val - pD.val) / xa;

      if (abXaRatio >= 0.35 && abXaRatio <= 0.82 && adXaRatio >= 0.55 && adXaRatio <= 0.92) {
        const isBat = abXaRatio < 0.55 && adXaRatio >= 0.78;
        const patType = isBat ? 'HARMONIC_BAT' : 'HARMONIC_GARTLEY';
        const patName = isBat ? 'Harmonik Yarasa (Bullish Bat XABCD)' : 'Harmonik Gartley (Bullish XABCD)';
        patterns.push({
          id: `pat_${patType.toLowerCase()}`,
          type: patType,
          turkishName: patName,
          bias: 'BULLISH',
          status: 'CONFIRMED',
          necklinePrice: Number(pC.val.toFixed(2)),
          targetPrice: Number((pD.val + (pC.val - pD.val) * 0.618).toFixed(2)),
          stopLossPrice: Number((pX.val - currentAtr * 0.35).toFixed(2)),
          confidenceScore: 83,
          description: `X(${pX.val.toFixed(2)})-A(${pA.val.toFixed(2)})-B(${pB.val.toFixed(2)})-C(${pC.val.toFixed(2)})-D(${pD.val.toFixed(2)}) Fibonacci harmonik dönüş bölgesi (AB/XA: ${abXaRatio.toFixed(2)}, AD/XA: ${adXaRatio.toFixed(2)}).`,
          detectedIndex: ohlcv.length - 1,
          startDate: ohlcv[baseIdx + pX.idx].dateStr,
          boundaries: { upper: pA.val, lower: pX.val },
          invalidationCondition: `X noktası (${pX.val.toFixed(2)} TL) altı kapanış`,
          timeframe,
          keyPoints: [
            pt(pX.idx, pX.val, 'X'),
            pt(pA.idx, pA.val, 'A'),
            pt(pB.idx, pB.val, 'B'),
            pt(pC.idx, pC.val, 'C'),
            pt(pD.idx, pD.val, 'D (PRZ)')
          ]
        });
      }
    }
  }

  // 16. Kanallar (Yükselen, Düşen, Yatay Kanal)
  const channels = detectAutoChannels(ohlcv);
  for (const ch of channels) {
    patterns.push({
      id: `pat_${ch.id}`,
      type: ch.type,
      turkishName: ch.label,
      bias: ch.type === 'CHANNEL_UP' ? 'BULLISH' : ch.type === 'CHANNEL_DOWN' ? 'BEARISH' : 'NEUTRAL',
      status: 'FORMING',
      necklinePrice: Number(ch.upperPriceNow.toFixed(2)),
      targetPrice: Number((ch.upperPriceNow * 1.05).toFixed(2)),
      stopLossPrice: Number((ch.lowerPriceNow * 0.98).toFixed(2)),
      confidenceScore: 75,
      description: `Eğim: ${(ch.slope * 100).toFixed(2)}%. Alt bant: ${ch.lowerPriceNow.toFixed(2)} TL, Üst bant: ${ch.upperPriceNow.toFixed(2)} TL.`,
      detectedIndex: ohlcv.length - 1,
      startDate: ch.startDate,
      boundaries: { upper: ch.upperPriceNow, lower: ch.lowerPriceNow, upperSlope: ch.slope, lowerSlope: ch.slope },
      invalidationCondition: `${ch.lowerPriceNow.toFixed(2)} TL altı kırılım`,
      timeframe
    });
  }

  return patterns;
}

// 20. Otomatik Kanal Tespiti (Madde 9)
// Lineer regresyon ve paralel koridor tespiti: Yükselen, Düşen, Yatay Kanal
export function detectAutoChannels(ohlcv: OHLCV[]): AutoChannel[] {
  if (!ohlcv || ohlcv.length < 20) return [];

  const lookback = Math.min(60, ohlcv.length);
  const subset = ohlcv.slice(-lookback);
  const n = subset.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = subset[i].close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  // En yüksek ve en düşük sapmaları bul
  let maxUpperDev = -Infinity;
  let maxLowerDev = Infinity;
  for (let i = 0; i < n; i++) {
    const regLine = slope * i + intercept;
    const highDev = subset[i].high - regLine;
    const lowDev = subset[i].low - regLine;
    if (highDev > maxUpperDev) maxUpperDev = highDev;
    if (lowDev < maxLowerDev) maxLowerDev = lowDev;
  }

  const upperIntercept = intercept + maxUpperDev * 0.85;
  const lowerIntercept = intercept + maxLowerDev * 0.85;

  const upperPriceNow = Number((slope * (n - 1) + upperIntercept).toFixed(2));
  const lowerPriceNow = Number((slope * (n - 1) + lowerIntercept).toFixed(2));

  const relSlope = slope / (subset[0].close || 1);
  let type: AutoChannel['type'] = 'CHANNEL_HORIZONTAL';
  let label = 'Yatay Kanal';

  if (relSlope > 0.0015) {
    type = 'CHANNEL_UP';
    label = 'Yükselen Kanal';
  } else if (relSlope < -0.0015) {
    type = 'CHANNEL_DOWN';
    label = 'Düşen Kanal';
  }

  return [{
    id: `channel_${type.toLowerCase()}`,
    type,
    label,
    slope: Number(slope.toFixed(4)),
    upperIntercept: Number(upperIntercept.toFixed(2)),
    lowerIntercept: Number(lowerIntercept.toFixed(2)),
    startIdx: ohlcv.length - n,
    endIdx: ohlcv.length - 1,
    startDate: subset[0].dateStr,
    endDate: subset[n - 1].dateStr,
    upperPriceNow,
    lowerPriceNow,
    touches: 4
  }];
}

// 21. Zirve ve Direnç Uzaklığı Metrikleri (Madde 10)
export function calculatePeakAndResistanceMetrics(
  ohlcv: OHLCV[],
  period: string = '1y'
): PeakAndResistanceMetrics {
  if (!ohlcv || ohlcv.length === 0) {
    return {
      lastPrice: 0,
      marketDataTime: '',
      periodHigh: 0,
      distanceFromPeakPct: 0,
      nearestResistance: null,
      distanceToResistancePct: null,
      nearestSupport: null,
      distanceToSupportPct: null,
      period
    };
  }

  const lastCandle = ohlcv[ohlcv.length - 1];
  const lastPrice = lastCandle.close;
  const marketDataTime = lastCandle.dateStr;

  // Seçilen dönemin en yüksek fiyatı
  const periodHigh = Math.max(...ohlcv.map(b => b.high));

  // Zirveden yüzdesel uzaklık: (Dönem zirvesi - Güncel fiyat) / Dönem zirvesi × 100
  const distanceFromPeakPct = periodHigh > 0
    ? Number((((periodHigh - lastPrice) / periodHigh) * 100).toFixed(2))
    : 0;

  // Tarihsel destek ve dirençler (Bağımsız motor ve ayrık veri kümeleri)
  const dataset = detectSupportResistanceDataset(ohlcv, period);
  const nearestResistance = dataset.nearestResistance;
  const nearestSupport = dataset.nearestSupport;

  // Dirence yüzdesel uzaklık: ((Direnç fiyatı - Kapanış) / Direnç fiyatı) × 100
  const distanceToResistancePct = nearestResistance
    ? nearestResistance.distancePercent
    : null;

  // Desteğe yüzdesel uzaklık: ((Kapanış - Destek fiyatı) / Destek fiyatı) × 100
  const distanceToSupportPct = nearestSupport
    ? nearestSupport.distancePercent
    : null;

  return {
    lastPrice,
    marketDataTime,
    periodHigh,
    distanceFromPeakPct,
    nearestResistance,
    distanceToResistancePct,
    nearestSupport,
    distanceToSupportPct,
    period
  };
}

// 22. Çoklu Zaman Dilimi Trend Matrisi (EMA20 & EMA50 Tabanlı)
export function calculateMultiTimeframeTrends(ohlcv: OHLCV[]): MultiTimeframeTrend[] {
  if (!ohlcv || ohlcv.length < 30) return [];

  const closes = ohlcv.map(b => b.close);
  const currentPrice = closes[closes.length - 1];

  const evaluateTrend = (data: number[]): { trend: MultiTimeframeTrend['trend']; score: number; rsi: number } => {
    const rsi = calculateRSI(data, 14).pop() || 50;
    const ema20 = calculateEMA(data, 20).pop() || currentPrice;
    const ema50 = calculateEMA(data, 50).pop() || currentPrice;

    let score = 50;
    if (currentPrice > ema20) score += 20;
    else score -= 20;

    if (ema20 > ema50) score += 15;
    else score -= 15;

    if (rsi > 55) score += 15;
    else if (rsi < 45) score -= 15;

    score = Math.max(5, Math.min(95, score));

    let trend: MultiTimeframeTrend['trend'] = 'NEUTRAL';
    if (score >= 80) trend = 'STRONG_BULL';
    else if (score >= 60) trend = 'BULLISH';
    else if (score <= 25) trend = 'STRONG_BEAR';
    else if (score <= 40) trend = 'BEARISH';

    return { trend, score, rsi };
  };

  const dailyEval = evaluateTrend(closes);
  const weeklySimulated = evaluateTrend(closes.filter((_, idx) => idx % 5 === 0));
  const h4Simulated = evaluateTrend(closes.slice(-40));
  const h1Simulated = evaluateTrend(closes.slice(-20));
  const m15Simulated = evaluateTrend(closes.slice(-10));

  return [
    {
      timeframe: '1w',
      label: 'Haftalık (1W)',
      trend: weeklySimulated.trend,
      strengthScore: weeklySimulated.score,
      rsi: weeklySimulated.rsi,
      summary: weeklySimulated.trend.includes('BULL') ? 'Ana EMA20 yükseliş trendi korunuyor' : 'Uzun vadeli baskı devam ediyor'
    },
    {
      timeframe: '1d',
      label: 'Günlük (1D)',
      trend: dailyEval.trend,
      strengthScore: dailyEval.score,
      rsi: dailyEval.rsi,
      summary: dailyEval.trend.includes('BULL') ? 'Günlük periyotta EMA5 & EMA20 alıcılar hakim' : 'Günlük periyotta satıcılar üstün'
    },
    {
      timeframe: '4h',
      label: '4 Saatlik (4H)',
      trend: h4Simulated.trend,
      strengthScore: h4Simulated.score,
      rsi: h4Simulated.rsi,
      summary: h4Simulated.trend.includes('BULL') ? 'Ara trend yukarı yönlü' : 'Düzeltme dalgası etkili'
    },
    {
      timeframe: '1h',
      label: '1 Saatlik (1H)',
      trend: h1Simulated.trend,
      strengthScore: h1Simulated.score,
      rsi: h1Simulated.rsi,
      summary: h1Simulated.trend.includes('BULL') ? 'Kısa vadeli momentum pozitif' : 'Kısa vadede kâr satışı gözleniyor'
    },
    {
      timeframe: '15m',
      label: '15 Dakikalık (15M)',
      trend: m15Simulated.trend,
      strengthScore: m15Simulated.score,
      rsi: m15Simulated.rsi,
      summary: m15Simulated.trend.includes('BULL') ? 'Gün içi giriş yönü yukarı' : 'Gün içi baskı hakim'
    }
  ];
}

// 23. Deterministik Senaryo Modellemesi
export function calculateScenarioHorizons(ohlcv: OHLCV[]): {
  horizon5d: ScenarioHorizon;
  horizon7d: ScenarioHorizon;
  horizon10d: ScenarioHorizon;
} {
  const currentPrice = ohlcv[ohlcv.length - 1].close;
  const highs = ohlcv.map(b => b.high);
  const lows = ohlcv.map(b => b.low);
  const closes = ohlcv.map(b => b.close);

  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atr = atrSeries[atrSeries.length - 1] || currentPrice * 0.025;
  const rsi = calculateRSI(closes, 14).pop() || 50;
  const ema20 = calculateEMA(closes, 20).pop() || currentPrice;
  const ema50 = calculateEMA(closes, 50).pop() || currentPrice;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);

  let bullWeight = 35;
  if (currentPrice > ema20) bullWeight += 12;
  if (ema20 > ema50) bullWeight += 10;
  if (rsi > 52 && rsi < 68) bullWeight += 8;
  if (rsi >= 70) bullWeight -= 10;
  if (rsi <= 32) bullWeight += 10;

  bullWeight = Math.min(65, Math.max(20, bullWeight));
  const bearWeight = Math.min(60, Math.max(15, 80 - bullWeight));
  const baseWeight = 100 - bullWeight - bearWeight;

  const buildHorizon = (days: 5 | 7 | 10): ScenarioHorizon => {
    const horizonVol = dailyVol * Math.sqrt(days);
    const horizonAtr = atr * Math.sqrt(days) * 0.85;

    const bullHigh = currentPrice + horizonAtr * 1.6;
    const bullLow = currentPrice + horizonAtr * 0.6;
    const expectedGainPct = Number((((bullHigh - currentPrice) / currentPrice) * 100).toFixed(2));

    const bearLow = currentPrice - horizonAtr * 1.5;
    const bearHigh = currentPrice - horizonAtr * 0.5;
    const expectedLossPct = Number((((currentPrice - bearLow) / currentPrice) * 100).toFixed(2));

    const baseLow = currentPrice - horizonAtr * 0.4;
    const baseHigh = currentPrice + horizonAtr * 0.4;

    const invalidationBull = Number((currentPrice - horizonAtr * 0.8).toFixed(2));
    const invalidationBear = Number((currentPrice + horizonAtr * 0.8).toFixed(2));

    const var95LossPct = Number((1.645 * horizonVol * 100).toFixed(2));
    const riskRewardRatio = Number((expectedGainPct / (expectedLossPct || 1)).toFixed(2));

    return {
      days,
      bullish: {
        probability: bullWeight,
        targetLow: Number(bullLow.toFixed(2)),
        targetHigh: Number(bullHigh.toFixed(2)),
        expectedGainPct,
        triggerCondition: `${(currentPrice + atr * 0.4).toFixed(2)} TL direnç eşiğinin hacimli aşılması`,
        invalidationPrice: invalidationBull
      },
      base: {
        probability: baseWeight,
        corridorLow: Number(baseLow.toFixed(2)),
        corridorHigh: Number(baseHigh.toFixed(2)),
        triggerCondition: `${baseLow.toFixed(2)} - ${baseHigh.toFixed(2)} TL yatay denge bandında kalma`
      },
      bearish: {
        probability: bearWeight,
        targetLow: Number(bearLow.toFixed(2)),
        targetHigh: Number(bearHigh.toFixed(2)),
        expectedLossPct,
        triggerCondition: `${(currentPrice - atr * 0.4).toFixed(2)} TL destek altı kapanış teyidi`,
        invalidationPrice: invalidationBear
      },
      volatilityEstimatePct: Number((horizonVol * 100).toFixed(2)),
      var95LossPct,
      riskRewardRatio
    };
  };

  return {
    horizon5d: buildHorizon(5),
    horizon7d: buildHorizon(7),
    horizon10d: buildHorizon(10)
  };
}

export const DEFAULT_TECHNICAL_WEIGHTS: TechnicalScoreWeights = {
  trend: 25,
  momentum: 25,
  volume: 20,
  volatility: 15,
  structure: 15
};

// 24. Açıklanabilir Nicel Teknik Puan (EMA Tabanlı)
export function calculateTechnicalScore(
  ohlcv: OHLCV[],
  userWeights?: Partial<TechnicalScoreWeights>
): TechnicalScoreBreakdown {
  const weights: TechnicalScoreWeights = {
    trend: userWeights?.trend ?? DEFAULT_TECHNICAL_WEIGHTS.trend,
    momentum: userWeights?.momentum ?? DEFAULT_TECHNICAL_WEIGHTS.momentum,
    volume: userWeights?.volume ?? DEFAULT_TECHNICAL_WEIGHTS.volume,
    volatility: userWeights?.volatility ?? DEFAULT_TECHNICAL_WEIGHTS.volatility,
    structure: userWeights?.structure ?? DEFAULT_TECHNICAL_WEIGHTS.structure,
  };

  const sumWeights = weights.trend + weights.momentum + weights.volume + weights.volatility + weights.structure || 100;
  const normWeights = {
    trend: (weights.trend / sumWeights) * 100,
    momentum: (weights.momentum / sumWeights) * 100,
    volume: (weights.volume / sumWeights) * 100,
    volatility: (weights.volatility / sumWeights) * 100,
    structure: (weights.structure / sumWeights) * 100,
  };

  const missing: string[] = [];
  if (ohlcv.length < 20) missing.push('Yetersiz veri (< 20 bar)');
  if (ohlcv.length < 50) missing.push('EMA50 eksik');
  if (ohlcv.length < 200) missing.push('EMA200 eksik');

  if (ohlcv.length < 20) {
    return {
      totalScore: 0,
      isComputable: false,
      missingIndicators: missing,
      weights,
      components: {
        trend: { score: 0, maxScore: weights.trend, details: 'Yetersiz bar sayısı.' },
        momentum: { score: 0, maxScore: weights.momentum, details: 'Yetersiz bar sayısı.' },
        volume: { score: 0, maxScore: weights.volume, details: 'Yetersiz bar sayısı.' },
        volatility: { score: 0, maxScore: weights.volatility, details: 'Yetersiz bar sayısı.' },
        structure: { score: 0, maxScore: weights.structure, details: 'Yetersiz bar sayısı.' },
      },
      evaluationText: 'Analiz için en az 20 adet doğrulanmış bar verisi gereklidir.',
      disclaimer: 'Teknik puan yükselme olasılığı veya kâr garantisi değildir.'
    };
  }

  const closes = ohlcv.map(b => b.close);
  const currentPrice = closes[closes.length - 1];

  const ind = buildTechnicalIndicators(ohlcv);
  const zones = detectSupportResistanceZones(ohlcv);
  const patterns = detectChartPatterns(ohlcv);

  // 1. Trend Component (EMA Tabanlı)
  let rawTrend = 50;
  const trendDetails: string[] = [];
  if (ind.ema20) {
    if (currentPrice > ind.ema20) { rawTrend += 12; trendDetails.push(`Fiyat > EMA20 (+12)`); }
    else { rawTrend -= 12; trendDetails.push(`Fiyat < EMA20 (-12)`); }
  }
  if (ind.ema50) {
    if (currentPrice > ind.ema50) { rawTrend += 14; trendDetails.push(`Fiyat > EMA50 (+14)`); }
    else { rawTrend -= 14; trendDetails.push(`Fiyat < EMA50 (-14)`); }
  }
  if (ind.ema200) {
    if (currentPrice > ind.ema200) { rawTrend += 14; trendDetails.push(`Fiyat > EMA200 (+14)`); }
    else { rawTrend -= 14; trendDetails.push(`Fiyat < EMA200 (-14)`); }
    if (ind.ema50 && ind.ema50 > ind.ema200) { rawTrend += 10; trendDetails.push(`EMA Golden Cross rejimi (+10)`); }
  }
  rawTrend = Math.max(0, Math.min(100, rawTrend));
  const trendScore = Number(((rawTrend * normWeights.trend) / 100).toFixed(1));

  // 2. Momentum Component
  let rawMom = 50;
  const momDetails: string[] = [];
  if (ind.rsi14 !== null) {
    if (ind.rsi14 >= 50 && ind.rsi14 <= 68) { rawMom += 25; momDetails.push(`RSI ${ind.rsi14.toFixed(1)} boğa bölgesi (+25)`); }
    else if (ind.rsi14 > 68 && ind.rsi14 <= 78) { rawMom += 10; momDetails.push(`RSI ${ind.rsi14.toFixed(1)} aşırı alım (+10)`); }
    else if (ind.rsi14 > 78) { rawMom -= 15; momDetails.push(`RSI ${ind.rsi14.toFixed(1)} aşırı alım düzeltme riski (-15)`); }
    else if (ind.rsi14 < 30) { rawMom += 15; momDetails.push(`RSI ${ind.rsi14.toFixed(1)} aşırı satım tepkisi (+15)`); }
    else if (ind.rsi14 >= 30 && ind.rsi14 < 45) { rawMom -= 20; momDetails.push(`RSI ${ind.rsi14.toFixed(1)} zayıf ayı momentumu (-20)`); }
  }
  if (ind.macd) {
    if (ind.macd.histogram > 0 && ind.macd.macdLine > ind.macd.signalLine) {
      rawMom += 15;
      momDetails.push(`MACD pozitif kesişim (+15)`);
    } else if (ind.macd.histogram < 0) {
      rawMom -= 15;
      momDetails.push(`MACD negatif histogram (-15)`);
    }
  }
  rawMom = Math.max(0, Math.min(100, rawMom));
  const momentumScore = Number(((rawMom * normWeights.momentum) / 100).toFixed(1));

  // 3. Volume Component (20 Günlük EMA Hacim)
  let rawVol = 50;
  const volDetails: string[] = [];
  if (ind.volumeRatio) {
    if (ind.volumeRatio >= 1.5) { rawVol += 30; volDetails.push(`Günlük hacim EMA ortalamasının ${ind.volumeRatio}x katı (+30)`); }
    else if (ind.volumeRatio >= 1.1) { rawVol += 15; volDetails.push(`Hacim ortalamanın üzerinde (${ind.volumeRatio}x) (+15)`); }
    else if (ind.volumeRatio < 0.7) { rawVol -= 20; volDetails.push(`Düşük hacim (${ind.volumeRatio}x) (-20)`); }
  }
  rawVol = Math.max(0, Math.min(100, rawVol));
  const volumeScore = Number(((rawVol * normWeights.volume) / 100).toFixed(1));

  // 4. Volatility Component
  let rawVolatility = 50;
  const volaDetails: string[] = [];
  if (ind.bollinger) {
    if (ind.bollinger.bandwidth < 5.0) {
      rawVolatility += 25;
      volaDetails.push(`Bollinger bant daralması (%${ind.bollinger.bandwidth}) (+25)`);
    } else if (ind.bollinger.percentB > 0.8 && currentPrice >= ind.bollinger.upper) {
      rawVolatility += 15;
      volaDetails.push(`Üst bant kırılımı test ediliyor (+15)`);
    }
  }
  rawVolatility = Math.max(0, Math.min(100, rawVolatility));
  const volatilityScore = Number(((rawVolatility * normWeights.volatility) / 100).toFixed(1));

  // 5. Structure Component
  let rawStructure = 50;
  const structDetails: string[] = [];
  const nearestSup = zones.find(z => z.type === 'SUPPORT');
  const nearestRes = zones.find(z => z.type === 'RESISTANCE');
  if (nearestSup && Math.abs(nearestSup.distancePercent) <= 2.0) {
    rawStructure += 15;
    structDetails.push(`Desteğe (%${nearestSup.distancePercent.toFixed(1)}) yakın (+15)`);
  }
  if (nearestRes && Math.abs(nearestRes.distancePercent) <= 1.5) {
    rawStructure -= 10;
    structDetails.push(`Dirence (%${nearestRes.distancePercent.toFixed(1)}) çok yakın (-10)`);
  }
  const confirmedBullPattern = patterns.find(p => p.bias === 'BULLISH' && p.status === 'CONFIRMED');
  if (confirmedBullPattern) {
    rawStructure += 20;
    structDetails.push(`${confirmedBullPattern.turkishName} teyit edildi (+20)`);
  }
  rawStructure = Math.max(0, Math.min(100, rawStructure));
  const structureScore = Number(((rawStructure * normWeights.structure) / 100).toFixed(1));

  const totalScore = Math.min(100, Math.max(0, Math.round(trendScore + momentumScore + volumeScore + volatilityScore + structureScore)));

  let evalText = 'Nötr teknik görünüm';
  if (totalScore >= 75) evalText = 'Güçlü pozitif teknik uyum (EMA & Momentum Boğa)';
  else if (totalScore >= 60) evalText = 'Pozitif eğilimli teknik yapı';
  else if (totalScore <= 35) evalText = 'Zayıf / Ayı baskılı teknik görünüm';
  else if (totalScore <= 20) evalText = 'Ağır satış baskısı ve negatif rejim';

  return {
    totalScore,
    isComputable: true,
    missingIndicators: missing,
    weights,
    components: {
      trend: { score: trendScore, maxScore: Number(normWeights.trend.toFixed(1)), details: trendDetails.join(', ') || 'Nötr' },
      momentum: { score: momentumScore, maxScore: Number(normWeights.momentum.toFixed(1)), details: momDetails.join(', ') || 'Nötr' },
      volume: { score: volumeScore, maxScore: Number(normWeights.volume.toFixed(1)), details: volDetails.join(', ') || 'Normal' },
      volatility: { score: volatilityScore, maxScore: Number(normWeights.volatility.toFixed(1)), details: volaDetails.join(', ') || 'Dengeli' },
      structure: { score: structureScore, maxScore: Number(normWeights.structure.toFixed(1)), details: structDetails.join(', ') || 'Yatay kanal' },
    },
    evaluationText: evalText,
    disclaimer: 'Teknik puan kâr garantisi değildir. Deterministik göstergelerin mevcut teknik uyum derecesini gösterir.'
  };
}

// 25. Extended Scenario Modeling
export function calculateScenarioHorizonsExtended(ohlcv: OHLCV[]): {
  horizons: {
    horizon5d: ScenarioHorizon;
    horizon7d: ScenarioHorizon;
    horizon10d: ScenarioHorizon;
  };
  calibration: ScenarioCalibrationReport;
} {
  const basicHorizons = calculateScenarioHorizons(ohlcv);

  const closes = ohlcv.map(b => b.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const n = returns.length;
  const meanReturn = returns.reduce((a, b) => a + b, 0) / (n || 1);
  const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (n - 1 || 1);
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252);

  let sumCube = 0;
  let sumQuad = 0;
  for (const r of returns) {
    const diff = (r - meanReturn) / (dailyVol || 1);
    sumCube += Math.pow(diff, 3);
    sumQuad += Math.pow(diff, 4);
  }
  const skewness = Number(((n / ((n - 1) * (n - 2) || 1)) * sumCube).toFixed(3));
  const kurtosis = Number((((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3) || 1)) * sumQuad - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3) || 1)).toFixed(3));

  let withinBandCount = 0;
  let rollingCount = 0;
  const horizonBars = 5;
  for (let i = horizonBars; i < closes.length; i++) {
    const periodReturn = Math.log(closes[i] / closes[i - horizonBars]);
    const expectedBand = dailyVol * Math.sqrt(horizonBars);
    if (Math.abs(periodReturn) <= expectedBand) {
      withinBandCount++;
    }
    rollingCount++;
  }
  const realized70Bucket = rollingCount > 0 ? Number(((withinBandCount / rollingCount) * 100).toFixed(1)) : 68.2;
  const brierScore = Number((Math.pow((realized70Bucket / 100) - 0.70, 2)).toFixed(4));

  let calStatus: 'WELL_CALIBRATED' | 'ACCEPTABLE' | 'DRIFTING' = 'WELL_CALIBRATED';
  if (Math.abs(realized70Bucket - 70) > 10) calStatus = 'DRIFTING';
  else if (Math.abs(realized70Bucket - 70) > 5) calStatus = 'ACCEPTABLE';

  let regime: 'LOW_VOL_TRENDING' | 'HIGH_VOL_CHOPPY' | 'BREAKOUT_MOMENTUM' | 'CONSOLIDATION' = 'CONSOLIDATION';
  if (dailyVol < 0.018) regime = 'LOW_VOL_TRENDING';
  else if (dailyVol > 0.032) regime = 'HIGH_VOL_CHOPPY';
  else if (Math.abs(skewness) > 0.6) regime = 'BREAKOUT_MOMENTUM';

  const dataSufficiencyScore = Math.min(100, Math.round((ohlcv.length / 180) * 100));

  return {
    horizons: basicHorizons,
    calibration: {
      modelStatus: 'EXPERIMENTAL',
      sampleBars: ohlcv.length,
      historicalVolatilityAnnualized: Number((annualizedVol * 100).toFixed(2)),
      dailyVolatilityPct: Number((dailyVol * 100).toFixed(2)),
      dailySkewness: skewness,
      dailyKurtosis: kurtosis,
      historicalCalibration: {
        bucket70PctTheoretical: 70.0,
        bucket70PctRealized: realized70Bucket,
        brierScore,
        calibrationStatus: calStatus
      },
      regime,
      dataSufficiencyScore
    }
  };
}

// ==========================================
// FAZ 5 Madde 7: %85 AL Eşiği ve Sinyal Denetim Motoru
export interface EvaluateTechnicalSignalsOptions {
  excludeEma200?: boolean;
}

export function evaluateTechnicalSignals(
  ohlcv: OHLCV[],
  symbol: string = 'BIST',
  options?: EvaluateTechnicalSignalsOptions
): TechnicalSignalAudit {
  const defaultAudit: TechnicalSignalAudit = {
    symbol,
    currentPrice: 0,
    timeframe: '1d',
    lastDataTime: '',
    evaluatedIndicatorsCount: 0,
    uncomputableIndicatorsCount: 0,
    buySignalsCount: 0,
    sellSignalsCount: 0,
    neutralSignalsCount: 0,
    buySignalRatioPct: 0,
    sellSignalRatioPct: 0,
    neutralSignalRatioPct: 0,
    thresholdMet: false,
    requiredThresholdPct: 55.0,
    signals: [],
    uncomputableList: [{ name: 'OHLCV Verisi', reason: 'Yetersiz bar sayısı nedeniyle sinyaller denetlenemedi' }],
    correlationWarning: 'EMA göstergeleri birbirine yüksek derecede bağımlıdır.',
    legalDisclaimer: 'YASAL UYARI: %55 AL sinyali, %55 başarı olasılığı veya %55 yükseliş ihtimali anlamına gelmez.'
  };

  if (!ohlcv || ohlcv.length === 0) return defaultAudit;

  const lastCandle = ohlcv[ohlcv.length - 1];
  const currentPrice = lastCandle.close;
  const lastDataTime = lastCandle.dateStr;
  const timeframe = lastCandle.timeframe || '1d';

  const indicators = buildTechnicalIndicators(ohlcv);
  const zones = detectSupportResistanceZones(ohlcv);
  const breakouts = detectBreakouts(ohlcv, zones);

  const signals: IndicatorSignalDetail[] = [];
  const uncomputableList: { name: string; reason: string }[] = [];

  // 1. EMA5 & EMA20 Kesişim ve Yönü (Kısa Vade Trend)
  if (indicators.ema5 !== null && indicators.ema20 !== null) {
    const isBull = indicators.ema5 > indicators.ema20;
    const isCrossBull = indicators.emaTrends?.crossover === 'BULLISH_CROSS';
    const isCrossBear = indicators.emaTrends?.crossover === 'BEARISH_CROSS';

    let sig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';
    if (isCrossBull || (isBull && currentPrice > indicators.ema5)) {
      sig = 'BUY';
      reason = `EMA5 (${indicators.ema5.toFixed(2)} TL), EMA20 (${indicators.ema20.toFixed(2)} TL) üzerinde ve boğa eğilimli.`;
    } else if (isCrossBear || (!isBull && currentPrice < indicators.ema5)) {
      sig = 'SELL';
      reason = `EMA5 (${indicators.ema5.toFixed(2)} TL), EMA20 (${indicators.ema20.toFixed(2)} TL) altında ayı baskılı.`;
    } else {
      sig = 'NEUTRAL';
      reason = `EMA5 ve EMA20 dar bantta yatay seyrediyor.`;
    }

    signals.push({
      id: 'sig_ema5_ema20',
      name: 'EMA5 / EMA20 Trendi',
      category: 'TREND',
      signal: sig,
      valueStr: `EMA5: ${indicators.ema5.toFixed(2)} | EMA20: ${indicators.ema20.toFixed(2)}`,
      reason,
      isComputable: true,
      isIndependent: false,
      correlationNote: 'EMA5 ve EMA20 birbirine doğrudan bağımlıdır; bağımsız iki ayrı kanıt olarak değerlendirilemez.'
    });
  } else {
    uncomputableList.push({ name: 'EMA5 / EMA20', reason: 'En az 20 bar geçmiş verisi bulunamadı.' });
  }

  // 2. Fiyat vs EMA20 (Ana Trend)
  if (indicators.ema20 !== null) {
    const isAbove = currentPrice > indicators.ema20;
    signals.push({
      id: 'sig_price_vs_ema20',
      name: 'Fiyat vs EMA20 Ana Trend Eşiği',
      category: 'TREND',
      signal: isAbove ? 'BUY' : 'SELL',
      valueStr: `Fiyat: ${currentPrice.toFixed(2)} TL / EMA20: ${indicators.ema20.toFixed(2)} TL`,
      reason: isAbove ? 'Fiyat ana trend belirleyici EMA20 üzerinde pozitif seyrediyor.' : 'Fiyat EMA20 altında negatif düzeltme bölgesinde.',
      isComputable: true,
      isIndependent: false,
      correlationNote: 'EMA20 ana trendi ile EMA5/EMA20 kesişimi yüksek korelasyona sahiptir.'
    });
  } else {
    uncomputableList.push({ name: 'EMA20', reason: 'Yetersiz bar sayısı.' });
  }

  // 3. Fiyat vs EMA50 (Orta Vade Trend)
  if (indicators.ema50 !== null) {
    const isAbove = currentPrice > indicators.ema50;
    signals.push({
      id: 'sig_price_vs_ema50',
      name: 'Fiyat vs EMA50 Orta Vade Eşiği',
      category: 'TREND',
      signal: isAbove ? 'BUY' : 'SELL',
      valueStr: `Fiyat: ${currentPrice.toFixed(2)} TL / EMA50: ${indicators.ema50.toFixed(2)} TL`,
      reason: isAbove ? 'Fiyat 50 günlük orta vade EMA ortalamasının üzerinde.' : 'Fiyat 50 günlük EMA altında.',
      isComputable: true,
      isIndependent: true
    });
  } else {
    uncomputableList.push({ name: 'EMA50', reason: 'En az 50 bar veri gereklidir (Hesaplanamadı).' });
  }

  // 4. Fiyat vs EMA200 (Uzun Vade Trend - Hisse Tarayıcı'da excludeEma200 ile devre dışı bırakılabilir)
  if (!options?.excludeEma200) {
    if (indicators.ema200 !== null) {
      const isAbove = currentPrice > indicators.ema200;
      signals.push({
        id: 'sig_price_vs_ema200',
        name: 'Fiyat vs EMA200 Uzun Vade Eşiği',
        category: 'TREND',
        signal: isAbove ? 'BUY' : 'SELL',
        valueStr: `Fiyat: ${currentPrice.toFixed(2)} TL / EMA200: ${indicators.ema200.toFixed(2)} TL`,
        reason: isAbove ? 'Fiyat kurumsal uzun vade EMA200 üzerinde boğa rejiminde.' : 'Fiyat EMA200 altında ayı rejiminde.',
        isComputable: true,
        isIndependent: true
      });
    } else {
      // Madde 7 Kuralı: Hesaplanamayan göstergeler ASLA AL veya NÖTR sayılmaz!
      uncomputableList.push({ name: 'EMA200', reason: 'En az 200 bar geçmiş veri gereklidir. Kesinlikle AL veya Nötr olarak sayılmaz.' });
    }
  }

  // 5. RSI 14 (Momentum)
  if (indicators.rsi14 !== null) {
    const rsi = indicators.rsi14;
    let sig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';
    if (rsi >= 50 && rsi <= 68) {
      sig = 'BUY';
      reason = `RSI (${rsi.toFixed(1)}) güçlü boğa momentum bölgesinde aşırı şişkinlik olmadan ilerliyor.`;
    } else if (rsi < 30) {
      sig = 'BUY'; // Aşırı satım tepkisi
      reason = `RSI (${rsi.toFixed(1)}) aşırı satım bölgesinde (Tepki potansiyeli).`;
    } else if (rsi > 70) {
      sig = 'SELL';
      reason = `RSI (${rsi.toFixed(1)}) aşırı alım bölgesinde (Kâr satışı riski).`;
    } else if (rsi < 45) {
      sig = 'SELL';
      reason = `RSI (${rsi.toFixed(1)}) zayıf ayı momentum bölgesinde.`;
    } else {
      sig = 'NEUTRAL';
      reason = `RSI (${rsi.toFixed(1)}) dengeli nötr aralıkta.`;
    }

    signals.push({
      id: 'sig_rsi14',
      name: 'RSI (14) Momentum Göstergesi',
      category: 'MOMENTUM',
      signal: sig,
      valueStr: `${rsi.toFixed(1)}`,
      reason,
      isComputable: true,
      isIndependent: true
    });
  } else {
    uncomputableList.push({ name: 'RSI14', reason: 'Yetersiz bar sayısı.' });
  }

  // 6. MACD (12, 26, 9)
  if (indicators.macd !== null) {
    const { macdLine, signalLine, histogram } = indicators.macd;
    let sig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';
    if (histogram > 0 && macdLine > signalLine) {
      sig = 'BUY';
      reason = `MACD çizgisi (${macdLine.toFixed(2)}) sinyal (${signalLine.toFixed(2)}) üzerinde ve pozitif histogram (${histogram.toFixed(2)}).`;
    } else if (histogram < 0 && macdLine < signalLine) {
      sig = 'SELL';
      reason = `MACD çizgisi sinyal altında ve negatif histogramda (${histogram.toFixed(2)}).`;
    } else {
      sig = 'NEUTRAL';
      reason = `MACD histogramı sıfır çizgisi civarında nötr.`;
    }

    signals.push({
      id: 'sig_macd',
      name: 'MACD (12, 26, 9)',
      category: 'MOMENTUM',
      signal: sig,
      valueStr: `Hist: ${histogram.toFixed(2)} | Çizgi: ${macdLine.toFixed(2)}`,
      reason,
      isComputable: true,
      isIndependent: true
    });
  } else {
    uncomputableList.push({ name: 'MACD', reason: 'Yetersiz bar sayısı.' });
  }

  // 7. Bollinger Bantları (EMA20 Orta Bantlı)
  if (indicators.bollinger !== null) {
    const { upper, middle, lower, bandwidth } = indicators.bollinger;
    let sig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';
    if (currentPrice > middle && currentPrice <= upper) {
      sig = 'BUY';
      reason = `Fiyat Bollinger orta bandının (EMA20: ${middle.toFixed(2)} TL) üzerinde pozitif dalgada.`;
    } else if (currentPrice < middle) {
      sig = 'SELL';
      reason = `Fiyat Bollinger orta bandının altında alt banda yönelimli.`;
    } else if (currentPrice > upper) {
      sig = 'NEUTRAL';
      reason = `Fiyat üst bant (${upper.toFixed(2)} TL) dışında, oynaklık yüksek.`;
    }

    signals.push({
      id: 'sig_bollinger',
      name: 'Bollinger Bantları (20, 2 - EMA20 Orta Bant)',
      category: 'VOLATILITY',
      signal: sig,
      valueStr: `Orta: ${middle.toFixed(2)} | Bant Genişliği: %${bandwidth.toFixed(1)}`,
      reason,
      isComputable: true,
      isIndependent: false,
      correlationNote: 'Bollinger orta bandı EMA20 ile hesaplandığından EMA20 ile tam uyumlu ve bağımlıdır.'
    });
  } else {
    uncomputableList.push({ name: 'Bollinger', reason: 'Yetersiz bar sayısı.' });
  }

  // 8. Hacim Oranı ve Hacim Trendi (20 Bar EMA)
  if (indicators.volumeRatio !== null) {
    const ratio = indicators.volumeRatio;
    const isUp = lastCandle.close >= lastCandle.open;
    let sig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';
    if (ratio >= 1.2 && isUp) {
      sig = 'BUY';
      reason = `Günlük işlem hacmi 20 bar EMA ortalamasının ${ratio.toFixed(2)}x katı ve pozitif kapanış.`;
    } else if (ratio >= 1.2 && !isUp) {
      sig = 'SELL';
      reason = `Hacimli satış günü (${ratio.toFixed(2)}x kat hacim ve negatif mum).`;
    } else {
      sig = 'NEUTRAL';
      reason = `İşlem hacmi 20 periyotluk olağan EMA bandında (${ratio.toFixed(2)}x).`;
    }

    signals.push({
      id: 'sig_volume',
      name: 'İşlem Hacmi Oranı (20 Bar Hacim EMA)',
      category: 'VOLUME',
      signal: sig,
      valueStr: `${ratio.toFixed(2)}x`,
      reason,
      isComputable: true,
      isIndependent: true
    });
  } else {
    uncomputableList.push({ name: 'Hacim Oranı', reason: 'Yetersiz hacim geçmişi.' });
  }

  // 9. Stokastik Osilatör (14, 3, 3)
  if (indicators.stochastic !== null) {
    const { k, d } = indicators.stochastic;
    let sig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';
    if (k > d && k < 80) {
      sig = 'BUY';
      reason = `%K (${k.toFixed(1)}) %D (${d.toFixed(1)}) üzerinde boğa kesişiminde.`;
    } else if (k < d) {
      sig = 'SELL';
      reason = `%K (${k.toFixed(1)}) %D altında ayı kesişiminde.`;
    } else {
      sig = 'NEUTRAL';
      reason = `Stokastik osilatör dengeli.`;
    }

    signals.push({
      id: 'sig_stochastic',
      name: 'Stokastik Osilatör (%K, %D)',
      category: 'MOMENTUM',
      signal: sig,
      valueStr: `%K: ${k.toFixed(1)} | %D: ${d.toFixed(1)}`,
      reason,
      isComputable: true,
      isIndependent: true
    });
  } else {
    uncomputableList.push({ name: 'Stokastik', reason: 'Yetersiz bar sayısı.' });
  }

  // 10. Parabolic SAR
  if (indicators.parabolicSar !== null) {
    const sar = indicators.parabolicSar;
    const isBull = currentPrice > sar;
    signals.push({
      id: 'sig_psar',
      name: 'Parabolic SAR Trend Takipçisi',
      category: 'TREND',
      signal: isBull ? 'BUY' : 'SELL',
      valueStr: `${sar.toFixed(2)} TL`,
      reason: isBull ? `SAR (${sar.toFixed(2)} TL) fiyatın altında, alım konumu aktif.` : `SAR (${sar.toFixed(2)} TL) fiyatın üzerinde, satış konumu aktif.`,
      isComputable: true,
      isIndependent: true
    });
  } else {
    uncomputableList.push({ name: 'Parabolic SAR', reason: 'Yetersiz bar sayısı.' });
  }

  // 11. Destek ve Direnç Konumu + Rol Değişimi (S-R Flip)
  const nearestSup = zones.filter(z => (z.type === 'SUPPORT' || z.status === 'flipped_support') && z.priceHigh <= currentPrice * 1.01)
    .sort((a, b) => b.pivotPrice - a.pivotPrice)[0];
  const nearestRes = zones.filter(z => (z.type === 'RESISTANCE' || z.status === 'flipped_resistance') && z.priceLow >= currentPrice * 0.99)
    .sort((a, b) => a.pivotPrice - b.pivotPrice)[0];

  let srSig: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let srReason = 'Fiyat destek ve direnç koridorunun ortasında dengeli.';
  if (breakouts.some(b => b.direction === 'BULLISH_BREAKOUT' && b.closeConfirmed)) {
    srSig = 'BUY';
    srReason = 'Teyitli direnç kırılımı ve destekleşen direnç (S-R Flip) dönüşümü gerçekleşti.';
  } else if (nearestSup && nearestSup.status === 'flipped_support' && ((currentPrice - nearestSup.pivotPrice) / currentPrice) * 100 <= 3.0) {
    srSig = 'BUY';
    srReason = `Kırılan direnç (${nearestSup.pivotPrice.toFixed(2)} TL) başarılı rol değişimi (S-R Flip) ile güçlü desteğe dönüştü.`;
  } else if (nearestSup && ((currentPrice - nearestSup.pivotPrice) / currentPrice) * 100 <= 2.5) {
    srSig = 'BUY';
    srReason = `Fiyat kırmızı destek bölgesine (%${(((currentPrice - nearestSup.pivotPrice) / currentPrice) * 100).toFixed(1)}) çok yakın ve tutunuyor.`;
  } else if (breakouts.some(b => b.direction === 'BEARISH_BREAKOUT' && b.closeConfirmed)) {
    srSig = 'SELL';
    srReason = 'Teyitli destek kırılımı ve dirençleşen destek (S-R Flip) gerçekleşti.';
  } else if (nearestRes && ((nearestRes.pivotPrice - currentPrice) / nearestRes.pivotPrice) * 100 <= 1.5) {
    srSig = 'SELL';
    srReason = `Fiyat yeşil direnç bölgesine (%${(((nearestRes.pivotPrice - currentPrice) / nearestRes.pivotPrice) * 100).toFixed(1)}) çok yakın (Kâr satışı eşiği).`;
  }

  signals.push({
    id: 'sig_support_resistance',
    name: 'Destek / Direnç Konumu ve Rol Değişimi (S-R Flip)',
    category: 'STRUCTURE',
    signal: srSig,
    valueStr: `Destek: ${nearestSup ? nearestSup.pivotPrice.toFixed(2) : '-'} | Direnç: ${nearestRes ? nearestRes.pivotPrice.toFixed(2) : '-'}`,
    reason: srReason,
    isComputable: true,
    isIndependent: true
  });

  // Kural 3: Algoritmik toplam skor / AL sinyali oranı %55'in üzerine çıktığında net olarak "AL SİNYALİ" üretir
  const evaluatedIndicatorsCount = signals.length;
  const uncomputableIndicatorsCount = uncomputableList.length;

  const buySignalsCount = signals.filter(s => s.signal === 'BUY').length;
  const sellSignalsCount = signals.filter(s => s.signal === 'SELL').length;
  const neutralSignalsCount = signals.filter(s => s.signal === 'NEUTRAL').length;

  const buySignalRatioPct = evaluatedIndicatorsCount > 0
    ? Number(((buySignalsCount / evaluatedIndicatorsCount) * 100).toFixed(1))
    : 0;

  const sellSignalRatioPct = evaluatedIndicatorsCount > 0
    ? Number(((sellSignalsCount / evaluatedIndicatorsCount) * 100).toFixed(1))
    : 0;

  const neutralSignalRatioPct = evaluatedIndicatorsCount > 0
    ? Number(((neutralSignalsCount / evaluatedIndicatorsCount) * 100).toFixed(1))
    : 0;

  const thresholdMet = buySignalRatioPct >= 55.0;

  let warningMessage: string | undefined;
  if (!thresholdMet) {
    warningMessage = `DİKKAT: %55 AL Sinyali Eşiği Sağlanamadı! Değerlendirilebilir ${evaluatedIndicatorsCount} adet geçerli göstergenin yalnızca %${buySignalRatioPct.toFixed(1)}'i (${buySignalsCount} adet) AL sinyali vermektedir (Asgari gerekli: %55.0). Dağılım: AL %${buySignalRatioPct.toFixed(1)}, SAT %${sellSignalRatioPct.toFixed(1)}, NÖTR %${neutralSignalRatioPct.toFixed(1)}.`;
  }

  const correlationWarning = 'METODOLOJİK UYARI: EMA5 ve EMA20 hareketli ortalamaları ile Bollinger bantları birbirine yüksek derecede bağımlıdır. Bu göstergeler birbirinden bağımsız iki ayrı doğrulama gibi yorumlanamaz.';
  const legalDisclaimer = 'YASAL UYARI: %55 üzeri AL sinyali, kesin yükseliş garantisi anlamına gelmez. Sermaye piyasalarında hiçbir matematiksel model getiri garantisi taşımaz.';

  return {
    symbol,
    currentPrice,
    timeframe,
    lastDataTime,
    evaluatedIndicatorsCount,
    uncomputableIndicatorsCount,
    buySignalsCount,
    sellSignalsCount,
    neutralSignalsCount,
    buySignalRatioPct,
    sellSignalRatioPct,
    neutralSignalRatioPct,
    thresholdMet,
    requiredThresholdPct: 55.0,
    signals,
    uncomputableList,
    warningMessage,
    correlationWarning,
    legalDisclaimer
  };
}

export {
  calculateResistanceBreakoutScore,
  calculateNearSupportMetrics,
  calculateBuySignalRatioMetrics,
  detectValidatedChartPatterns,
  runPatternHistoricalBacktest
} from './screenerEngines.js';
