// app/api/positions/route.js
// Fetches current prices for a list of tickers

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];

function getHeaders() {
  return {
    "User-Agent": UA_LIST[Math.floor(Math.random() * UA_LIST.length)],
    "Accept": "application/json",
    "Referer": "https://finance.yahoo.com/",
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPrice(sym) {
  await sleep(Math.random() * 300); // stagger requests
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,
    { headers: getHeaders(), next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`${sym}: ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${sym}`);
  const meta = result.meta;
  const closes = result.indicators.quote[0].close.filter(Boolean);
  return {
    sym,
    price: meta.regularMarketPrice || closes[closes.length - 1],
    prevClose: meta.previousClose || closes[closes.length - 2],
    name: meta.longName || meta.shortName || sym,
    high52: meta.fiftyTwoWeekHigh,
    low52: meta.fiftyTwoWeekLow,
  };
}

export async function POST(request) {
  const { tickers } = await request.json();
  if (!tickers || !Array.isArray(tickers)) {
    return Response.json({ error: "tickers array required" }, { status: 400 });
  }

  const results = await Promise.allSettled(tickers.map(t => fetchPrice(t.toUpperCase())));
  const prices = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") prices[tickers[i].toUpperCase()] = r.value;
    else prices[tickers[i].toUpperCase()] = { sym: tickers[i], price: null, error: r.reason?.message };
  });

  return Response.json(prices);
}
