// lib/models.js — all quantitative signal computations

export const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
export const std = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
export const logRet = (p) => p.slice(1).map((v, i) => Math.log(v / p[i]));

export function computeGARCH(rets) {
  let h = rets.slice(0, 20).reduce((s, r) => s + r * r, 0) / 20;
  const vols = rets.map((r) => {
    h = 0.000001 + 0.08 * r * r + 0.91 * h;
    return Math.sqrt(h * 252) * 100;
  });
  const cur = vols[vols.length - 1];
  const hist = vols.slice(-60);
  const pct = (hist.filter((v) => v < cur).length / hist.length) * 100;
  return { current: cur.toFixed(1), percentile: pct.toFixed(0), series: hist };
}

export function computeKalman(prices) {
  let x = prices[0], P = 1;
  const sm = prices.map((z) => {
    P += 0.0001;
    const K = P / (P + 0.01);
    x += K * (z - x);
    P = (1 - K) * P;
    return x;
  });
  const slope = ((sm[sm.length - 1] - sm[sm.length - 6]) / sm[sm.length - 6]) * 100;
  return {
    smoothed: sm.slice(-60),
    slope: slope.toFixed(2),
    direction: slope > 0.5 ? "UP" : slope < -0.5 ? "DOWN" : "FLAT",
  };
}

export function computeHMM(rets) {
  const regs = [];
  for (let i = 20; i <= rets.length; i++) {
    const s = rets.slice(i - 20, i);
    regs.push(mean(s) > 0 && std(s) < 0.015 ? 1 : mean(s) < 0 && std(s) > 0.015 ? -1 : 0);
  }
  const cur = regs[regs.length - 1];
  const rec = regs.slice(-10);
  return {
    regime: cur === 1 ? "BULL" : cur === -1 ? "BEAR" : "SIDEWAYS",
    bullDays: rec.filter((r) => r === 1).length,
    bearDays: rec.filter((r) => r === -1).length,
  };
}

export function computeMomentum(prices) {
  const n = prices.length;
  const safe = (d) => (n > d ? ((prices[n - 1] / prices[n - 1 - d]) - 1) * 100 : 0);
  const m1 = safe(22), m3 = safe(63), m6 = safe(126);
  const sc = m1 * 0.5 + m3 * 0.3 + m6 * 0.2;
  return {
    mom1m: m1.toFixed(1), mom3m: m3.toFixed(1), mom6m: m6.toFixed(1),
    score: sc.toFixed(1),
    signal: sc > 5 ? "STRONG BUY" : sc > 1 ? "BUY" : sc < -5 ? "STRONG SELL" : sc < -1 ? "SELL" : "NEUTRAL",
  };
}

export function computeRSI(prices, period = 14) {
  const d = prices.slice(1).map((v, i) => v - prices[i]);
  let ag = d.slice(0, period).filter((v) => v > 0).reduce((s, v) => s + v, 0) / period;
  let al = d.slice(0, period).filter((v) => v < 0).reduce((s, v) => s - v, 0) / period;
  d.slice(period).forEach((v) => {
    ag = (ag * (period - 1) + Math.max(v, 0)) / period;
    al = (al * (period - 1) + Math.max(-v, 0)) / period;
  });
  const r = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  return {
    value: r.toFixed(1),
    signal: r > 70 ? "OVERBOUGHT" : r < 30 ? "OVERSOLD" : r > 55 ? "BULLISH" : r < 45 ? "BEARISH" : "NEUTRAL",
  };
}

export function computeMACD(prices) {
  const ema = (p, n) => {
    const k = 2 / (n + 1);
    let e = p[0];
    return p.map((v) => (e = v * k + e * (1 - k)));
  };
  const ml = ema(prices, 12).map((v, i) => v - ema(prices, 26)[i]);
  const sig = ema(ml, 9);
  const hist = ml.map((v, i) => v - sig[i]);
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];
  return {
    macd: ml[ml.length - 1].toFixed(3),
    signal: sig[sig.length - 1].toFixed(3),
    histogram: last.toFixed(3),
    crossover:
      last > 0 && prev <= 0 ? "BULLISH CROSS"
      : last < 0 && prev >= 0 ? "BEARISH CROSS"
      : last > 0 ? "BULLISH" : "BEARISH",
  };
}

export function computeMeanRev(prices) {
  const sl = prices.slice(-20), m = mean(sl), s = std(sl);
  const p = prices[prices.length - 1], z = (p - m) / s;
  return {
    zScore: z.toFixed(2),
    upper: (m + 2 * s).toFixed(2),
    lower: (m - 2 * s).toFixed(2),
    mid: m.toFixed(2),
    signal: z > 2 ? "SELL (Extended)" : z < -2 ? "BUY (Oversold)" : z > 1 ? "SLIGHTLY EXTENDED" : z < -1 ? "SLIGHTLY OVERSOLD" : "WITHIN BANDS",
  };
}

export function computeFactors(info) {
  const pe = info?.trailingPE || 0;
  const roe = (info?.returnOnEquity || 0) * 100;
  const rev = (info?.revenueGrowth || 0) * 100;
  const mgn = (info?.profitMargins || 0) * 100;
  return {
    value: { score: Math.max(0, Math.min(100, pe > 0 ? 100 - pe * 1.2 : 50)).toFixed(0), raw: `P/E: ${pe?.toFixed(1) || "N/A"}` },
    quality: { score: Math.min(100, Math.max(0, roe * 2 + mgn * 1.5)).toFixed(0), raw: `ROE: ${roe?.toFixed(1) || "N/A"}%` },
    growth: { score: Math.min(100, Math.max(0, rev * 2 + 50)).toFixed(0), raw: `Rev: +${rev?.toFixed(1) || "N/A"}%` },
  };
}

export function runAllModels(prices, info) {
  const rets = logRet(prices);
  return {
    garch: computeGARCH(rets),
    kalman: computeKalman(prices),
    hmm: computeHMM(rets),
    momentum: computeMomentum(prices),
    rsi: computeRSI(prices),
    macd: computeMACD(prices),
    meanRev: computeMeanRev(prices),
    factors: computeFactors(info),
  };
}
