// app/api/performance/route.js
// Fetches 1Y historical prices for all positions + SPY benchmark
// Calculates returns, alpha, beta, Sharpe, drawdown

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

async function fetchHistory(sym) {
  await sleep(Math.random() * 300);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`;
  const res = await fetch(url, {
    headers: getHeaders(),
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${sym}: ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${sym}`);
  const raw = result.indicators.quote[0].close;
  const prices = raw.map((v, i) => v === null ? raw[i - 1] ?? 0 : v).filter(Boolean);
  const timestamps = result.timestamp.slice(-prices.length);
  const meta = result.meta;
  return {
    sym,
    prices,
    timestamps,
    currentPrice: meta.regularMarketPrice || prices[prices.length - 1],
    name: meta.longName || meta.shortName || sym,
  };
}

// ── Math ──────────────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std  = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const logRet = (p) => p.slice(1).map((v, i) => Math.log(v / p[i]));

function calcReturns(prices) {
  const n = prices.length;
  const safe = (d) => n > d ? ((prices[n-1] / prices[n-1-d]) - 1) * 100 : null;
  return {
    ret1m:  safe(21),
    ret3m:  safe(63),
    ret6m:  safe(126),
    ret1y:  safe(Math.min(251, n-1)),
    total:  ((prices[n-1] / prices[0]) - 1) * 100,
  };
}

function calcSharpe(prices, riskFreeRate = 0.05) {
  const rets = logRet(prices);
  const annRet = mean(rets) * 252;
  const annVol = std(rets) * Math.sqrt(252);
  return annVol > 0 ? ((annRet - riskFreeRate) / annVol).toFixed(2) : "0.00";
}

function calcDrawdown(prices) {
  let peak = prices[0];
  let maxDD = 0;
  let currentDD = 0;
  const ddSeries = [];

  for (const p of prices) {
    if (p > peak) peak = p;
    currentDD = (p - peak) / peak * 100;
    if (currentDD < maxDD) maxDD = currentDD;
    ddSeries.push(currentDD);
  }

  return {
    current: currentDD.toFixed(2),
    max: maxDD.toFixed(2),
    peak: peak.toFixed(2),
    series: ddSeries.slice(-60),
    isCritical: currentDD < -15,
    isWarning:  currentDD < -10 && currentDD >= -15,
  };
}

function calcAlphaBeta(portRets, benchRets) {
  const n = Math.min(portRets.length, benchRets.length);
  const p = portRets.slice(-n);
  const b = benchRets.slice(-n);
  const meanP = mean(p), meanB = mean(b);
  const cov = p.reduce((s, _, i) => s + (p[i] - meanP) * (b[i] - meanB), 0) / n;
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / n;
  const beta  = varB > 0 ? cov / varB : 1;
  const alpha = (meanP - beta * meanB) * 252 * 100; // annualized %
  return { alpha: alpha.toFixed(2), beta: beta.toFixed(2) };
}

// Build normalized equity curve (start = 100)
function normalizePrices(prices) {
  const base = prices[0];
  return prices.map(p => (p / base) * 100);
}

// Align two price series to same length using last N days
function alignSeries(a, b) {
  const n = Math.min(a.length, b.length);
  return [a.slice(-n), b.slice(-n)];
}

export async function POST(request) {
  const { positions } = await request.json();
  // positions = [{ sym, shares, costBasis }]

  if (!positions || positions.length === 0) {
    return Response.json({ error: "No positions provided" }, { status: 400 });
  }

  const tickers = [...new Set([...positions.map(p => p.sym), "SPY"])];

  // Fetch all histories in parallel
  const results = await Promise.allSettled(tickers.map(t => fetchHistory(t)));
  const histMap = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") histMap[tickers[i]] = r.value;
  });

  const spyData = histMap["SPY"];
  if (!spyData) return Response.json({ error: "Could not fetch SPY benchmark" }, { status: 500 });

  // ── Per-position analysis ─────────────────────────────────────────────────
  const positionStats = positions.map(p => {
    const hist = histMap[p.sym];
    if (!hist) return { sym: p.sym, error: "No data", shares: p.shares, costBasis: p.costBasis };

    const drawdown = calcDrawdown(hist.prices);
    const returns  = calcReturns(hist.prices);
    const sharpe   = calcSharpe(hist.prices);
    const currentValue = hist.currentPrice * p.shares;
    const costValue    = p.costBasis * p.shares;
    const glAmt        = currentValue - costValue;
    const glPct        = ((currentValue / costValue) - 1) * 100;

    // Beta vs SPY
    const [pRets, bRets] = alignSeries(logRet(hist.prices), logRet(spyData.prices));
    const { alpha, beta } = calcAlphaBeta(pRets, bRets);

    return {
      sym: p.sym,
      name: hist.name,
      shares: p.shares,
      costBasis: p.costBasis,
      currentPrice: hist.currentPrice,
      currentValue,
      costValue,
      glAmt,
      glPct: glPct.toFixed(2),
      returns,
      sharpe,
      drawdown,
      alpha,
      beta,
      normalizedPrices: normalizePrices(hist.prices).slice(-60),
      timestamps: hist.timestamps.slice(-60),
    };
  });

  // ── Portfolio-level aggregate ─────────────────────────────────────────────
  const totalValue   = positionStats.reduce((s, p) => s + (p.currentValue || 0), 0);
  const totalCost    = positionStats.reduce((s, p) => s + (p.costValue    || 0), 0);
  const totalGL      = totalValue - totalCost;
  const totalGLPct   = totalCost > 0 ? ((totalValue / totalCost) - 1) * 100 : 0;

  // Weighted portfolio return series
  const validPositions = positionStats.filter(p => p.normalizedPrices);
  let portNormalized = null;
  if (validPositions.length > 0) {
    const minLen = Math.min(...validPositions.map(p => p.normalizedPrices.length));
    const weights = validPositions.map(p => (p.currentValue || 0) / (totalValue || 1));
    portNormalized = Array.from({ length: minLen }, (_, i) =>
      validPositions.reduce((s, p, wi) => s + weights[wi] * p.normalizedPrices[p.normalizedPrices.length - minLen + i], 0)
    );
  }

  // SPY normalized (same window)
  const spyNormalized = normalizePrices(spyData.prices).slice(-60);
  const spyReturns    = calcReturns(spyData.prices);
  const spySharpe     = calcSharpe(spyData.prices);
  const spyDrawdown   = calcDrawdown(spyData.prices);

  // Portfolio vs SPY alpha/beta
  let portAlpha = null, portBeta = null;
  if (portNormalized && portNormalized.length > 10) {
    const pRets = logRet(portNormalized);
    const bRets = logRet(spyNormalized.slice(-portNormalized.length));
    const ab = calcAlphaBeta(pRets, bRets);
    portAlpha = ab.alpha;
    portBeta  = ab.beta;
  }

  // Portfolio drawdown (value-weighted)
  const portDrawdown = positionStats.filter(p => p.drawdown).length > 0
    ? positionStats.reduce((worst, p) => {
        if (!p.drawdown) return worst;
        const w = (p.currentValue || 0) / (totalValue || 1);
        return worst + parseFloat(p.drawdown.current) * w;
      }, 0).toFixed(2)
    : "0.00";

  // Criticals
  const criticalPositions = positionStats.filter(p => p.drawdown?.isCritical).map(p => p.sym);
  const warningPositions  = positionStats.filter(p => p.drawdown?.isWarning).map(p => p.sym);

  return Response.json({
    positions: positionStats,
    portfolio: {
      totalValue,
      totalCost,
      totalGL,
      totalGLPct: totalGLPct.toFixed(2),
      alpha: portAlpha,
      beta:  portBeta,
      normalizedPrices: portNormalized?.slice(-60) || [],
    },
    benchmark: {
      sym: "SPY",
      name: "S&P 500 ETF",
      returns: spyReturns,
      sharpe: spySharpe,
      drawdown: spyDrawdown,
      normalizedPrices: spyNormalized,
    },
    drawdown: {
      portfolioDD: portDrawdown,
      criticalPositions,
      warningPositions,
    },
    timestamp: new Date().toISOString(),
  });
}
