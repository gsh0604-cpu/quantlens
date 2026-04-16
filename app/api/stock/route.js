// app/api/stock/route.js
// Server-side proxy — Yahoo Finance never sees a browser request, so no CORS issues.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sym = (searchParams.get("sym") || "AAPL").toUpperCase().trim();

  try {
    const [chartRes, summaryRes] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "application/json",
          },
          next: { revalidate: 300 }, // cache 5 min
        }
      ),
      fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=summaryDetail,defaultKeyStatistics,financialData`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "application/json",
          },
          next: { revalidate: 300 },
        }
      ),
    ]);

    if (!chartRes.ok) {
      return Response.json({ error: `Yahoo returned ${chartRes.status} for ${sym}` }, { status: 404 });
    }

    const chartJson = await chartRes.json();
    const summaryJson = summaryRes.ok ? await summaryRes.json() : null;

    const result = chartJson?.chart?.result?.[0];
    if (!result) {
      return Response.json({ error: `No data found for ${sym}` }, { status: 404 });
    }

    const closes = result.indicators.quote[0].close;
    const prices = closes.map((v, i) => (v === null ? closes[i - 1] ?? 0 : v)).filter(Boolean);
    const meta = result.meta;

    const summaryModules = summaryJson?.quoteSummary?.result?.[0] || {};
    const info = {
      ...summaryModules.summaryDetail,
      ...summaryModules.defaultKeyStatistics,
      ...summaryModules.financialData,
    };

    return Response.json({
      symbol: sym,
      name: meta.longName || meta.shortName || sym,
      price: meta.regularMarketPrice || prices[prices.length - 1],
      prevClose: meta.previousClose || meta.chartPreviousClose || prices[prices.length - 2],
      high52: meta.fiftyTwoWeekHigh,
      low52: meta.fiftyTwoWeekLow,
      currency: meta.currency || "USD",
      prices,
      info: {
        trailingPE: info.trailingPE?.raw ?? info.trailingPE ?? null,
        priceToBook: info.priceToBook?.raw ?? info.priceToBook ?? null,
        revenueGrowth: info.revenueGrowth?.raw ?? info.revenueGrowth ?? null,
        profitMargins: info.profitMargins?.raw ?? info.profitMargins ?? null,
        returnOnEquity: info.returnOnEquity?.raw ?? info.returnOnEquity ?? null,
        debtToEquity: info.debtToEquity?.raw ?? info.debtToEquity ?? null,
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
