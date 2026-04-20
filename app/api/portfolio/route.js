// app/api/portfolio/route.js
// 5-ETF universe • Momentum + Markowitz combined optimizer • Risk profile aware

const ETFS = [
  { sym: "SPY", name: "S&P 500",    category: "equity" },
  { sym: "QQQ", name: "Nasdaq 100", category: "equity" },
  { sym: "GLD", name: "Gold",       category: "alt"    },
  { sym: "TLT", name: "Long Bond",  category: "bond"   },
  { sym: "IWM", name: "Small Cap",  category: "equity" },
];

// Risk profile constraints
const RISK_PROFILES = {
  conservative: { cap: 0.25, minBond: 0.30, minAlt: 0.10, riskAversion: 5.0, label: "Conservative" },
  moderate:     { cap: 0.30, minBond: 0.15, minAlt: 0.05, riskAversion: 2.5, label: "Moderate"     },
  aggressive:   { cap: 0.40, minBond: 0.00, minAlt: 0.00, riskAversion: 1.0, label: "Aggressive"   },
};

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];
const getHeaders = () => ({
  "User-Agent": UA_LIST[Math.floor(Math.random() * UA_LIST.length)],
  "Accept": "application/json",
  "Referer": "https://finance.yahoo.com/",
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchETF(sym) {
  await sleep(Math.random() * 200);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: getHeaders(), next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${sym}: ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${sym}`);
  const raw = result.indicators.quote[0].close;
  const prices = raw.map((v, i) => (v === null ? raw[i - 1] ?? 0 : v)).filter(Boolean);
  const meta = result.meta;
  return { sym, prices, price: meta.regularMarketPrice || prices[prices.length - 1], prevClose: meta.previousClose || prices[prices.length - 2] };
}

// ── Math helpers ──────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std  = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const logRet = (p) => p.slice(1).map((v, i) => Math.log(v / p[i]));

// Covariance matrix (annualized)
function covMatrix(retArrays) {
  const n = retArrays.length;
  const T = Math.min(...retArrays.map(r => r.length));
  const aligned = retArrays.map(r => r.slice(-T));
  const means = aligned.map(r => mean(r));
  const cov = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const c = aligned[i].reduce((s, _, t) => s + (aligned[i][t] - means[i]) * (aligned[j][t] - means[j]), 0) / (T - 1);
      return c * 252; // annualize
    })
  );
  return cov;
}

// ── Momentum signal score ─────────────────────────────────────────────────────
function signalScore(prices) {
  const rets = logRet(prices);
  const n = prices.length;

  // GARCH vol
  let h = rets.slice(0, 20).reduce((s, r) => s + r * r, 0) / 20;
  const vols = rets.map(r => { h = 0.000001 + 0.08 * r * r + 0.91 * h; return Math.sqrt(h * 252) * 100; });

  // Momentum
  const safe = (d) => n > d ? ((prices[n - 1] / prices[n - 1 - d]) - 1) * 100 : 0;
  const mom1 = safe(22), mom3 = safe(63), mom6 = safe(126);
  const momScore = mom1 * 0.5 + mom3 * 0.3 + mom6 * 0.2;

  // HMM regime
  const regs = [];
  for (let i = 20; i <= rets.length; i++) {
    const s = rets.slice(i - 20, i);
    regs.push(mean(s) > 0 && std(s) < 0.015 ? 1 : mean(s) < 0 && std(s) > 0.015 ? -1 : 0);
  }
  const regimeBias = regs.slice(-10).reduce((s, r) => s + r, 0) / 10;

  // Kalman trend
  let x = prices[0], P = 1;
  const sm = prices.map(z => { P += 0.0001; const K = P / (P + 0.01); x += K * (z - x); P = (1 - K) * P; return x; });
  const trendSlope = ((sm[sm.length - 1] - sm[sm.length - 6]) / sm[sm.length - 6]) * 100;

  // RSI
  const d = prices.slice(1).map((v, i) => v - prices[i]);
  let ag = d.slice(0, 14).filter(v => v > 0).reduce((s, v) => s + v, 0) / 14;
  let al = d.slice(0, 14).filter(v => v < 0).reduce((s, v) => s - v, 0) / 14;
  d.slice(14).forEach(v => { ag = (ag * 13 + Math.max(v, 0)) / 14; al = (al * 13 + Math.max(-v, 0)) / 14; });
  const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  const rsiScore = rsi > 70 ? -10 : rsi < 30 ? 20 : (rsi - 50) * 0.5;

  const composite = momScore * 0.5 + regimeBias * 15 + trendSlope * 3 + rsiScore * 0.3;
  const annRet = mean(rets) * 252;
  const annVol = std(rets) * Math.sqrt(252);

  return {
    composite,
    momScore: momScore.toFixed(1),
    mom1m: mom1.toFixed(1), mom3m: mom3.toFixed(1), mom6m: mom6.toFixed(1),
    regime: regs[regs.length - 1] === 1 ? "BULL" : regs[regs.length - 1] === -1 ? "BEAR" : "SIDEWAYS",
    trend: trendSlope > 0.5 ? "UP" : trendSlope < -0.5 ? "DOWN" : "FLAT",
    rsi: rsi.toFixed(1),
    vol: vols[vols.length - 1].toFixed(1),
    sharpe: (annVol > 0 ? annRet / annVol : 0).toFixed(2),
    annRet: (annRet * 100).toFixed(1),
    rets, // pass through for covariance
  };
}

// ── Momentum + Markowitz combined optimizer ───────────────────────────────────
// Uses momentum signals as "views" on expected returns (Black-Litterman inspired),
// then runs mean-variance optimization with risk-aversion parameter from profile.
function optimizePortfolio(etfData, profile = "aggressive") {
  const cfg = RISK_PROFILES[profile] || RISK_PROFILES.aggressive;
  const n = etfData.length;

  // Build expected returns from momentum signal (annualized)
  // Scale composite score to a rough annual return estimate
  const mu = etfData.map(e => {
    const baseRet = parseFloat(e.score.annRet) / 100;
    const signalAdj = e.score.composite * 0.002; // momentum tilt
    return baseRet + signalAdj;
  });

  // Covariance matrix from historical returns
  const retArrays = etfData.map(e => e.score.rets);
  const cov = covMatrix(retArrays);

  // Mean-variance optimization via gradient descent
  // Maximize: w'μ - (λ/2) w'Σw  subject to: Σw=1, w≥0, w≤cap
  let w = new Array(n).fill(1 / n);

  for (let iter = 0; iter < 2000; iter++) {
    // Gradient of utility = mu - λ * Σw
    const Sw = w.map((_, i) => cov[i].reduce((s, c, j) => s + c * w[j], 0));
    const grad = mu.map((m, i) => m - cfg.riskAversion * Sw[i]);

    // Gradient step
    const lr = 0.005;
    w = w.map((wi, i) => Math.max(0, Math.min(cfg.cap, wi + lr * grad[i])));

    // Project back to simplex (sum to 1)
    const sum = w.reduce((s, v) => s + v, 0);
    if (sum > 0) w = w.map(v => v / sum);
  }

  // Apply risk profile constraints for bonds and alts
  const bondIdx = etfData.map((e, i) => e.category === "bond" ? i : -1).filter(i => i >= 0);
  const altIdx  = etfData.map((e, i) => e.category === "alt"  ? i : -1).filter(i => i >= 0);

  const bondWeight = bondIdx.reduce((s, i) => s + w[i], 0);
  const altWeight  = altIdx.reduce((s, i) => s + w[i], 0);

  // Enforce minimums for conservative/moderate
  if (bondWeight < cfg.minBond && bondIdx.length > 0) {
    const deficit = cfg.minBond - bondWeight;
    bondIdx.forEach(i => w[i] += deficit / bondIdx.length);
    // Reduce equity proportionally
    const equityIdx = etfData.map((e, i) => e.category === "equity" ? i : -1).filter(i => i >= 0);
    equityIdx.forEach(i => w[i] = Math.max(0, w[i] - deficit / equityIdx.length));
  }
  if (altWeight < cfg.minAlt && altIdx.length > 0) {
    const deficit = cfg.minAlt - altWeight;
    altIdx.forEach(i => w[i] += deficit / altIdx.length);
    const equityIdx = etfData.map((e, i) => e.category === "equity" ? i : -1).filter(i => i >= 0);
    equityIdx.forEach(i => w[i] = Math.max(0, w[i] - deficit / equityIdx.length));
  }

  // Final renormalize
  const total = w.reduce((s, v) => s + v, 0);
  w = total > 0 ? w.map(v => v / total) : new Array(n).fill(1 / n);

  // Portfolio stats
  const portRet = w.reduce((s, wi, i) => s + wi * mu[i], 0);
  const portVar = w.reduce((s, wi, i) => s + w.reduce((ss, wj, j) => ss + wi * wj * cov[i][j], 0), 0);
  const portVol = Math.sqrt(Math.max(0, portVar));
  const sharpe  = portVol > 0 ? portRet / portVol : 0;

  return {
    weights: w,
    portRet: (portRet * 100).toFixed(1),
    portVol: (portVol * 100).toFixed(1),
    sharpe: sharpe.toFixed(2),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const profile = searchParams.get("profile") || "aggressive";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fetch all 5 ETFs in parallel
  const results = await Promise.allSettled(ETFS.map(etf => fetchETF(etf.sym)));

  const etfData = [];
  for (let i = 0; i < ETFS.length; i++) {
    const r = results[i];
    const meta = ETFS[i];
    if (r.status === "fulfilled") {
      const score = signalScore(r.value.prices);
      etfData.push({ ...meta, ...r.value, score, prices: r.value.prices.slice(-60) });
    } else {
      const dummyRets = Array.from({ length: 252 }, () => (Math.random() - 0.5) * 0.01);
      etfData.push({ ...meta, price: 0, prevClose: 0, score: { composite: 0, momScore: "0", mom1m: "0", mom3m: "0", mom6m: "0", regime: "SIDEWAYS", trend: "FLAT", rsi: "50", vol: "15", sharpe: "0", annRet: "0", rets: dummyRets }, prices: [], error: r.reason?.message });
    }
  }

  // Run combined optimizer
  const opt = optimizePortfolio(etfData, profile);

  // Build portfolio array with weights
  const portfolio = etfData.map((e, i) => ({
    ...e,
    weight: opt.weights[i],
    score: { ...e.score, rets: undefined }, // strip raw rets from response
  })).sort((a, b) => b.weight - a.weight);

  // Market regime
  const bullCount = etfData.filter(e => e.score.regime === "BULL").length;
  const bearCount = etfData.filter(e => e.score.regime === "BEAR").length;
  const marketRegime = bullCount >= 4 ? "RISK-ON" : bearCount >= 4 ? "RISK-OFF" : "MIXED";

  // AI narrative
  let narrative = null;
  if (apiKey) {
    const profileLabel = RISK_PROFILES[profile]?.label || "Aggressive";
    const top3 = portfolio.slice(0, 3).map(e => `${e.sym} (${(e.weight * 100).toFixed(0)}%)`).join(", ");
    const prompt = `You are a quant portfolio manager. Write a SHORT 3-sentence narrative for a ${profileLabel} investor's ETF portfolio.

MODEL: Momentum + Markowitz Mean-Variance Optimization
MARKET REGIME: ${marketRegime} (${bullCount}/5 ETFs bullish)
PORTFOLIO: Expected Return ${opt.portRet}%, Volatility ${opt.portVol}%, Sharpe ${opt.sharpe}
TOP HOLDINGS: ${top3}

ETF SIGNALS:
${portfolio.map(e => `- ${e.sym} (${e.name}): ${(e.weight * 100).toFixed(0)}% | Mom: ${e.score.momScore} | Regime: ${e.score.regime} | Trend: ${e.score.trend}`).join("\n")}

Return ONLY valid JSON:
{"narrative":"3 sentences","regimeSummary":"2-3 word label","topThesis":"one sentence on biggest bet"}`;

    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });
      const aiJson = await aiRes.json();
      const raw = (aiJson.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      narrative = JSON.parse(raw);
    } catch (_) { narrative = null; }
  }

  return Response.json({
    portfolio,
    marketRegime, bullCount, bearCount,
    expReturn: opt.portRet,
    expVol: opt.portVol,
    sharpe: opt.sharpe,
    profile,
    profileLabel: RISK_PROFILES[profile]?.label || "Aggressive",
    narrative,
    timestamp: new Date().toISOString(),
  });
}
