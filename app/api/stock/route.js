// app/api/stock/route.js
// Server-side proxy — Yahoo Finance never sees a browser request, so no CORS issues.

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

// Safely extract a numeric value from Yahoo's {raw, fmt} objects or plain numbers
function raw(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "raw" in v) return v.raw;
  if (typeof v === "number") return v;
  return null;
}

async function fetchFundamentals(sym) {
  // Try v11 first (more reliable), fall back to v10
  const urls = [
    `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData%2CincomeStatementHistory`,
    `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const j = await res.json();
      const modules = j?.quoteSummary?.result?.[0];
      if (!modules) continue;

      const sd  = modules.summaryDetail        || {};
      const ks  = modules.defaultKeyStatistics  || {};
      const fd  = modules.financialData         || {};

      const info = {
        trailingPE:      raw(sd.trailingPE)      ?? raw(ks.trailingPE)      ?? null,
        forwardPE:       raw(sd.forwardPE)        ?? raw(ks.forwardPE)        ?? null,
        priceToBook:     raw(ks.priceToBook)      ?? null,
        revenueGrowth:   raw(fd.revenueGrowth)    ?? null,
        earningsGrowth:  raw(fd.earningsGrowth)   ?? null,
        profitMargins:   raw(fd.profitMargins)    ?? raw(ks.profitMargins)   ?? null,
        returnOnEquity:  raw(fd.returnOnEquity)   ?? null,
        returnOnAssets:  raw(fd.returnOnAssets)   ?? null,
        debtToEquity:    raw(fd.debtToEquity)     ?? null,
        currentRatio:    raw(fd.currentRatio)     ?? null,
        totalRevenue:    raw(fd.totalRevenue)     ?? null,
        revenuePerShare: raw(fd.revenuePerShare)  ?? null,
      };

      // Only return if we got at least some real data
      if (Object.values(info).some(v => v !== null)) return info;
    } catch (_) { continue; }
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sym = (searchParams.get("sym") || "AAPL").toUpperCase().trim();

  try {
    // Fetch price chart and fundamentals in parallel
    const [chartRes, fundamentals] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`,
        { headers: YF_HEADERS, next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }
      ),
      fetchFundamentals(sym),
    ]);

    if (!chartRes.ok) {
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
