// app/api/portfolio/route.js
// Fetches all ETFs in parallel, runs optimization, calls Claude for narrative

const ETFS = [
  { sym: "SPY",  name: "S&P 500",          category: "equity" },
  { sym: "QQQ",  name: "Nasdaq 100",        category: "equity" },
  { sym: "IWM",  name: "Small Cap",         category: "equity" },
  { sym: "EFA",  name: "Intl Developed",    category: "equity" },
  { sym: "TLT",  name: "Long Treasury",     category: "bond"   },
  { sym: "IEF",  name: "Mid Treasury",      category: "bond"   },
  { sym: "HYG",  name: "High Yield",        category: "bond"   },
  { sym: "GLD",  name: "Gold",              category: "alt"    },
  { sym: "USO",  name: "Oil",               category: "alt"    },
  { sym: "XLV",  name: "Healthcare",        category: "sector" },
  { sym: "XLK",  name: "Technology",        category: "sector" },
  { sym: "XLP",  name: "Consumer Staples",  category: "sector" },
];

async function fetchETF(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${sym}: ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${sym}`);
  const raw = result.indicators.quote[0].close;
  const prices = raw.map((v, i) => (v === null ? raw[i - 1] ?? 0 : v)).filter(Boolean);
  const meta = result.meta;
  return { sym, prices, price: meta.regularMarketPrice || prices[prices.length - 1], prevClose: meta.previousClose || prices[prices.length - 2] };
}

// ── Math ──────────────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std  = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const logRet = (p) => p.slice(1).map((v, i) => Math.log(v / p[i]));

function signalScore(prices) {
  const rets = logRet(prices);
  const n = prices.length;

  // GARCH vol (lower = better for return-maximizing via sizing, but we want momentum leaders)
  let h = rets.slice(0, 20).reduce((s, r) => s + r * r, 0) / 20;
  const vols = rets.map(r => { h = 0.000001 + 0.08 * r * r + 0.91 * h; return Math.sqrt(h * 252) * 100; });
  const currentVol = vols[vols.length - 1];

  // Momentum scores
  const safe = (d) => n > d ? ((prices[n - 1] / prices[n - 1 - d]) - 1) * 100 : 0;
  const mom1 = safe(22), mom3 = safe(63), mom6 = safe(126);
  const momScore = mom1 * 0.5 + mom3 * 0.3 + mom6 * 0.2;

  // HMM regime
  const regs = [];
  for (let i = 20; i <= rets.length; i++) {
    const s = rets.slice(i - 20, i);
    regs.push(mean(s) > 0 && std(s) < 0.015 ? 1 : mean(s) < 0 && std(s) > 0.015 ? -1 : 0);
  }
  const regimeBias = regs.slice(-10).reduce((s, r) => s + r, 0) / 10; // -1 to +1

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

  // Composite score (aggressive: heavily momentum-weighted)
  const composite = momScore * 0.5 + regimeBias * 15 + trendSlope * 3 + rsiScore * 0.3;

  // Sharpe proxy
  const annRet = mean(rets) * 252;
  const annVol = std(rets) * Math.sqrt(252);
  const sharpe = annVol > 0 ? annRet / annVol : 0;

  return {
    composite,
    momScore: momScore.toFixed(1),
    mom1m: mom1.toFixed(1),
    mom3m: mom3.toFixed(1),
    mom6m: mom6.toFixed(1),
    regime: regs[regs.length - 1] === 1 ? "BULL" : regs[regs.length - 1] === -1 ? "BEAR" : "SIDEWAYS",
    trend: trendSlope > 0.5 ? "UP" : trendSlope < -0.5 ? "DOWN" : "FLAT",
    rsi: rsi.toFixed(1),
    vol: currentVol.toFixed(1),
    sharpe: sharpe.toFixed(2),
    annRet: (annRet * 100).toFixed(1),
  };
}

function optimizePortfolio(etfScores, profile = "aggressive") {
  // Filter to positive-scoring ETFs for aggressive profile
  const eligible = etfScores.filter(e => e.score.composite > -5);

  if (eligible.length === 0) return etfScores.map(e => ({ ...e, weight: 1 / etfScores.length }));

  // Aggressive: momentum-proportional weights, min 0, no cap except concentration limit
  const scores = eligible.map(e => Math.max(0, e.score.composite + 20)); // shift to positive
  const total = scores.reduce((s, v) => s + v, 0);

  // Raw weights
  let weights = scores.map(s => s / total);

  // Cap single position at 35% for aggressive
  const CAP = 0.35;
  let overflow = 0;
  weights = weights.map(w => { if (w > CAP) { overflow += w - CAP; return CAP; } return w; });

  // Redistribute overflow proportionally to uncapped
  const uncapped = weights.filter(w => w < CAP).length;
  if (uncapped > 0 && overflow > 0) {
    weights = weights.map(w => w < CAP ? w + overflow / uncapped : w);
  }

  // Map back to all ETFs (zero weight for excluded)
  let wi = 0;
  return etfScores.map(e => {
    const isEligible = eligible.find(el => el.sym === e.sym);
    if (!isEligible) return { ...e, weight: 0 };
    return { ...e, weight: weights[wi++] };
  });
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fetch all ETFs in parallel
  const results = await Promise.allSettled(ETFS.map(etf => fetchETF(etf.sym)));

  const etfData = [];
  for (let i = 0; i < ETFS.length; i++) {
    const r = results[i];
    const meta = ETFS[i];
    if (r.status === "fulfilled") {
      const score = signalScore(r.value.prices);
      etfData.push({ ...meta, ...r.value, score, prices: r.value.prices.slice(-60) });
    } else {
      // fallback with neutral score
      etfData.push({ ...meta, price: 0, prevClose: 0, score: { composite: 0, momScore: "0", mom1m: "0", mom3m: "0", mom6m: "0", regime: "SIDEWAYS", trend: "FLAT", rsi: "50", vol: "15", sharpe: "0", annRet: "0" }, prices: [], error: r.reason?.message });
    }
  }

  const portfolio = optimizePortfolio(etfData, "aggressive");

  // Sort by weight desc for display
  portfolio.sort((a, b) => b.weight - a.weight);

  // Market regime summary
  const bullCount  = etfData.filter(e => e.score.regime === "BULL").length;
  const bearCount  = etfData.filter(e => e.score.regime === "BEAR").length;
  const marketRegime = bullCount > 7 ? "RISK-ON" : bearCount > 7 ? "RISK-OFF" : "MIXED";

  // Expected portfolio return (weighted)
  const expReturn = portfolio.reduce((s, e) => s + e.weight * parseFloat(e.score.annRet || 0), 0);
  const expVol    = portfolio.reduce((s, e) => s + e.weight * parseFloat(e.score.vol || 15), 0);

  // AI narrative
  let narrative = null;
  if (apiKey) {
    const top3 = portfolio.slice(0, 3).map(e => `${e.sym} (${(e.weight * 100).toFixed(0)}%, momentum ${e.score.momScore})`).join(", ");
    const prompt = `You are a quant portfolio manager. Based on these signal-driven ETF allocations for an AGGRESSIVE, return-maximizing investor, write a SHORT portfolio narrative (3-4 sentences max).

MARKET REGIME: ${marketRegime} (${bullCount}/12 ETFs bullish)
TOP HOLDINGS: ${top3}
EXPECTED ANNUAL RETURN: ${expReturn.toFixed(1)}%
PORTFOLIO VOLATILITY: ${expVol.toFixed(1)}%

ETF ALLOCATIONS:
${portfolio.filter(e => e.weight > 0.01).map(e => `- ${e.sym} (${e.name}): ${(e.weight * 100).toFixed(0)}% | Mom: ${e.score.momScore} | Regime: ${e.score.regime} | Trend: ${e.score.trend}`).join("\n")}

Explain: (1) what the regime signals say, (2) why the top holdings make sense, (3) key risk to watch.
Keep it sharp, quant-style, no fluff. Return ONLY a JSON object:
{"narrative":"your text here","regimeSummary":"2-4 word regime label","topThesis":"one sentence on the biggest bet"}`;

    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });
      const aiJson = await aiRes.json();
      const raw = (aiJson.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      narrative = JSON.parse(raw);
    } catch (_) { narrative = null; }
  }

  return Response.json({ portfolio, marketRegime, bullCount, bearCount, expReturn: expReturn.toFixed(1), expVol: expVol.toFixed(1), narrative, timestamp: new Date().toISOString() });
}
