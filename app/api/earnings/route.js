// app/api/earnings/route.js
// Fetches earnings dates and options data for a symbol

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];

function getHeaders() {
  return {
    "User-Agent": UA_LIST[Math.floor(Math.random() * UA_LIST.length)],
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function raw(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "raw" in v) return v.raw;
  if (typeof v === "number") return v;
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sym = (searchParams.get("sym") || "AAPL").toUpperCase().trim();

  try {
    // Fetch calendar + options in parallel
    const [calRes, optRes] = await Promise.all([
      fetch(
        `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=calendarEvents%2CearningsHistory%2CdefaultKeyStatistics`,
        { headers: getHeaders(), next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }
      ),
      fetch(
        `https://query2.finance.yahoo.com/v7/finance/options/${sym}`,
        { headers: getHeaders(), next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) }
      ),
    ]);

    await sleep(100);

    // Parse earnings
    let earningsDate = null;
    let earningsDateStr = null;
    if (calRes.ok) {
      const calJson = await calRes.json();
      const modules = calJson?.quoteSummary?.result?.[0];
      const cal = modules?.calendarEvents;
      const ks  = modules?.defaultKeyStatistics;

      // Try multiple sources for earnings date
      const dates = cal?.earnings?.earningsDate;
      if (dates && dates.length > 0) {
        const ts = raw(dates[0]);
        if (ts) {
          earningsDate = ts * 1000; // convert to ms
          earningsDateStr = new Date(earningsDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
      }

      // Next earnings quarter estimate
      var epsForward = raw(ks?.forwardEps) ?? null;
    }

    // Parse options chain
    let optionsData = null;
    if (optRes.ok) {
      const optJson = await optRes.json();
      const chain = optJson?.optionChain?.result?.[0];
      if (chain) {
        const underlyingPrice = chain.quote?.regularMarketPrice;
        const expirations = chain.expirationDates || []; // unix timestamps

        // Get next 4 expiration dates (30-60 DTE range)
        const now = Date.now() / 1000;
        const upcoming = expirations
          .filter(e => e > now)
          .slice(0, 6)
          .map(e => ({
            timestamp: e,
            date: new Date(e * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            dte: Math.round((e - now) / 86400),
          }));

        // Get calls for the nearest expiry to extract IV
        const calls = chain.options?.[0]?.calls || [];
        const atm = calls.reduce((best, c) => {
          const strike = c.strike?.raw ?? c.strike;
          if (!best || Math.abs(strike - underlyingPrice) < Math.abs((best.strike?.raw ?? best.strike) - underlyingPrice)) return c;
          return best;
        }, null);

        const iv = atm ? (raw(atm.impliedVolatility) * 100) : null;

        // Build covered call recommendations for 30-45 DTE window
        const targetExpiries = upcoming.filter(e => e.dte >= 25 && e.dte <= 55);
        const ccStrikes = calls
          .filter(c => {
            const strike = raw(c.strike) ?? c.strike;
            return strike > underlyingPrice * 1.02 && strike < underlyingPrice * 1.20;
          })
          .map(c => ({
            strike: raw(c.strike) ?? c.strike,
            bid: raw(c.bid) ?? c.bid ?? 0,
            ask: raw(c.ask) ?? c.ask ?? 0,
            iv: (raw(c.impliedVolatility) ?? 0) * 100,
            delta: raw(c.delta) ?? null,
            oi: raw(c.openInterest) ?? 0,
            expiry: upcoming[0]?.date,
            dte: upcoming[0]?.dte,
          }))
          .sort((a, b) => a.strike - b.strike)
          .slice(0, 8);

        optionsData = {
          underlyingPrice,
          iv: iv?.toFixed(1) ?? null,
          expirations: upcoming,
          targetExpiries,
          ccStrikes,
          expectedMove: iv ? (underlyingPrice * (iv / 100) * Math.sqrt(30 / 365)).toFixed(2) : null,
        };
      }
    }

    // Days until earnings
    let daysToEarnings = null;
    if (earningsDate) {
      daysToEarnings = Math.round((earningsDate - Date.now()) / 86400000);
    }

    return Response.json({
      symbol: sym,
      earningsDate: earningsDateStr,
      earningsTimestamp: earningsDate,
      daysToEarnings,
      earningsWarning: daysToEarnings !== null && daysToEarnings >= 0 && daysToEarnings <= 45,
      options: optionsData,
    });
  } catch (err) {
    return Response.json({ symbol: sym, error: err.message, earningsDate: null, options: null });
  }
}
