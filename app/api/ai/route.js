// app/api/ai/route.js
// Calls Anthropic server-side — API key never touches the browser.

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set in environment variables." }, { status: 500 });
  }

  const body = await request.json();
  const { symbol, price, mods } = body;

  const prompt = `You are a senior quantitative analyst at a hedge fund. Analyze these model outputs for ${symbol} at $${price} and give a concise investment verdict.

QUANTITATIVE SIGNALS:
- GARCH Volatility: ${mods.garch.current}% annualized (${mods.garch.percentile}th percentile vs last 60 days)
- Kalman Filter Trend: ${mods.kalman.direction} (5-day slope: ${mods.kalman.slope}%)
- HMM Regime: ${mods.hmm.regime} (${mods.hmm.bullDays}/10 recent sessions bullish, ${mods.hmm.bearDays}/10 bearish)
- Momentum: 1M=${mods.momentum.mom1m}%, 3M=${mods.momentum.mom3m}%, 6M=${mods.momentum.mom6m}% → ${mods.momentum.signal}
- RSI(14): ${mods.rsi.value} → ${mods.rsi.signal}
- MACD: ${mods.macd.crossover} (histogram: ${mods.macd.histogram})
- Mean Reversion Z-Score: ${mods.meanRev.zScore} → ${mods.meanRev.signal}
- Factor Scores: Value=${mods.factors.value.score}/100 (${mods.factors.value.raw}), Quality=${mods.factors.quality.score}/100 (${mods.factors.quality.raw}), Growth=${mods.factors.growth.score}/100 (${mods.factors.growth.raw})

Respond ONLY with valid JSON, no markdown, no backticks, no extra text:
{"verdict":"STRONG BUY|BUY|HOLD|SELL|STRONG SELL","conviction":1-10,"oneliner":"one sentence summary","bulls":["bull1","bull2","bull3"],"bears":["bear1","bear2"],"keyRisk":"single biggest risk","priceTarget":"near-term price target or range"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return Response.json({ error: json.error?.message || "Anthropic API error" }, { status: res.status });
    }

    const raw = (json.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
    const verdict = JSON.parse(raw);
    return Response.json(verdict);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
