// app/api/stock/route.js
// Server-side proxy with retry logic and header rotation to avoid Yahoo 429s

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

function getHeaders() {
  return {
    "User-Agent": UA_LIST[Math.floor(Math.random() * UA_LIST.length)],
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) await sleep(600 * i); // wait 600ms, 1200ms between retries
      const res = await fetch(url, { ...options, headers: getHeaders(), signal: AbortSignal.timeout(8000) });
      if (res.status === 429 && i < retries - 1) continue; // retry on rate limit
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
  }
}

// Safely extract a numeric value from Yahoo's {raw, fmt} objects or plain numbers
function raw(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "raw" in v) return v.raw;
  if (typeof v === "number") return v;
  return null;
}

async function fetchFundamentals(sym) {
  const urls = [
    `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData`,
    `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData`,
  ];

  for (const url of urls) {
    try {
      const res = await fetchWithRetry(url, { next: { revalidate: 7200 } }); // cache 2hrs
      if (!res.ok) continue;
      const j = await res.json();
      const modules = j?.quoteSummary?.result?.[0];
      if (!modules) continue;

      const sd = modules.summaryDetail        || {};
      const ks = modules.defaultKeyStatistics  || {};
      const fd = modules.financialData         || {};

      const info = {
        trailingPE:     raw(sd.trailingPE)     ?? raw(ks.trailingPE)     ?? null,
        forwardPE:      raw(sd.forwardPE)       ?? raw(ks.forwardPE)       ?? null,
        priceToBook:    raw(ks.priceToBook)     ?? null,
        revenueGrowth:  raw(fd.revenueGrowth)   ?? null,
        earningsGrowth: raw(fd.earningsGrowth)  ?? null,
        profitMargins:  raw(fd.profitMargins)   ?? raw(ks.profitMargins)  ?? null,
        returnOnEquity: raw(fd.returnOnEquity)  ?? null,
        returnOnAssets: raw(fd.returnOnAssets)  ?? null,
        debtToEquity:   raw(fd.debtToEquity)    ?? null,
        currentRatio:   raw(fd.currentRatio)    ?? null,
      };

      if (Object.values(info).some(v => v !== null)) return info;
    } catch (_) { continue; }
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sym = (searchParams.get("sym") || "AAPL").toUpperCase().trim();

  try {
    // Stagger requests slightly to avoid simultaneous Yahoo hits
    const chartRes = await fetchWithRetry(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`,
      { next: { revalidate: 300 } } // cache 5 min
    );

    if (!chartRes.ok) {
      // On 429, return a helpful message instead of a crash
      if (chartRes.status === 429) {
        return Response.json({ error: "Yahoo Finance rate limit hit — please wait 30 seconds and try again." }, { status: 429 });
      }
      return Response.json({ error: `Yahoo returned ${chartRes.status} for ${sym}` }, { status: 404 });
    }

    const chartJson = await chartRes.json();
    const result = chartJson?.chart?.result?.[0];
    if (!result) {
      return Response.json({ error: `No data found for ${sym}` }, { status: 404 });
    }

    const closes = result.indicators.quote[0].close;
    const prices = closes.map((v, i) => (v === null ? closes[i - 1] ?? 0 : v)).filter(Boolean);
    const meta = result.meta;

    // Fetch fundamentals after a short delay to avoid triggering rate limits
    await sleep(200);
    const fundamentals = await fetchFundamentals(sym);

    return Response.json({
      symbol: sym,
      name: meta.longName || meta.shortName || sym,
      price: meta.regularMarketPrice || prices[prices.length - 1],
      prevClose: meta.previousClose || meta.chartPreviousClose || prices[prices.length - 2],
      high52: meta.fiftyTwoWeekHigh,
      low52: meta.fiftyTwoWeekLow,
      currency: meta.currency || "USD",
      prices,
      info: fundamentals || {},
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
