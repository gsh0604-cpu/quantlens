"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { runAllModels } from "../lib/models";

// ── UI helpers ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#00ff88", height = 36 }) {
  if (!data || data.length < 2) return null;
  const w = 110, h = height;
  const mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / r) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Gauge({ value, label, color }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle cx="29" cy="29" r="22" fill="none" stroke="#1a2235" strokeWidth="5" />
        <circle cx="29" cy="29" r="22" fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${(pct / 100) * 138.2} 138.2`} strokeLinecap="round" transform="rotate(-90 29 29)" />
        <text x="29" y="34" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontFamily="monospace" fontWeight="700">{Math.round(value)}</text>
      </svg>
      <div style={{ fontSize: 8, color: "#5a7a9a", marginTop: 1, letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

const BADGE_COLORS = {
  "STRONG BUY": "#00ff88", "BUY": "#4ade80", "BULLISH": "#4ade80", "BULLISH CROSS": "#4ade80",
  "BULL": "#4ade80", "UP": "#4ade80", "OVERSOLD": "#4ade80", "BUY (Oversold)": "#4ade80",
  "STRONG SELL": "#ff4560", "SELL": "#ff6b6b", "BEARISH": "#ff6b6b", "BEARISH CROSS": "#ff6b6b",
  "BEAR": "#ff6b6b", "DOWN": "#ff6b6b", "OVERBOUGHT": "#ff6b6b", "SELL (Extended)": "#ff6b6b",
  "HIGH VOL": "#f59e0b", "MED VOL": "#94a3b8", "LOW VOL": "#60a5fa",
  "NEUTRAL": "#94a3b8", "SIDEWAYS": "#f59e0b", "FLAT": "#f59e0b",
  "WITHIN BANDS": "#94a3b8", "SLIGHTLY EXTENDED": "#f59e0b", "SLIGHTLY OVERSOLD": "#60a5fa",
};

function Badge({ text }) {
  const c = BADGE_COLORS[text] || "#94a3b8";
  return (
    <span style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c, padding: "2px 6px", borderRadius: 3, fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function Card({ title, badge, spark, sparkColor, children }) {
  return (
    <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</span>
        {badge && <Badge text={badge} />}
      </div>
      {children}
      {spark && <Sparkline data={spark} color={sparkColor || "#60a5fa"} />}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
const WATCHLIST = ["MRVL", "NVDA", "AAPL", "MSFT", "TSLA", "AMD"];
const VERDICT_COLORS = { "STRONG BUY": "#00ff88", "BUY": "#4ade80", "HOLD": "#f59e0b", "SELL": "#ff6b6b", "STRONG SELL": "#ff4560" };

export default function Home() {
  const [ticker, setTicker] = useState("MRVL");
  const [input, setInput] = useState("MRVL");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [mods, setMods] = useState(null);
  const [verdict, setVerdict] = useState(null);

  const fetchStock = useCallback(async (sym) => {
    sym = sym.toUpperCase().trim();
    setLoading(true); setError(null); setVerdict(null); setData(null); setMods(null);
    try {
      const res = await fetch(`/api/stock?sym=${sym}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to fetch");
      setData(json);
      setMods(runAllModels(json.prices, json.info));
      setTicker(sym);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  const fetchAI = useCallback(async () => {
    if (!mods || !data) return;
    setAiLoading(true); setVerdict(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: data.symbol, price: data.price?.toFixed(2), mods }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setVerdict(json);
    } catch (e) {
      setVerdict({ verdict: "ERROR", oneliner: e.message, bulls: [], bears: [], keyRisk: "", conviction: 0 });
    }
    setAiLoading(false);
  }, [mods, data]);

  useEffect(() => { fetchStock("MRVL"); }, [fetchStock]);

  const pctChange = data ? ((data.price - data.prevClose) / data.prevClose * 100) : 0;
  const isUp = pctChange >= 0;
  const vc = VERDICT_COLORS[verdict?.verdict] || "#94a3b8";
  const rangePos = data?.high52 && data?.low52 ? Math.min(98, Math.max(2, ((data.price - data.low52) / (data.high52 - data.low52)) * 100)) : 50;

  return (
    <div style={{ minHeight: "100vh", background: "#060c16", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2a3a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, position: "sticky", top: 0, background: "#060c16", zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: "#00ff88", letterSpacing: "-0.02em" }}>
            QUANT<span style={{ color: "#e2e8f0" }}>LENS</span>
          </div>
          <div style={{ fontSize: 7, color: "#1e3040", letterSpacing: "0.2em" }}>INVESTMENT RESEARCH COCKPIT</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && fetchStock(input)}
            placeholder="TICKER"
            style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", width: 90, letterSpacing: "0.1em" }}
          />
          <button onClick={() => fetchStock(input)} style={{ background: "#00ff8818", border: "1px solid #00ff8840", color: "#00ff88", padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em" }}>
            GO
          </button>
          <Link href="/portfolio" style={{ background: "#a78bfa18", border: "1px solid #a78bfa40", color: "#a78bfa", padding: "7px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em", textDecoration: "none", whiteSpace: "nowrap" }}>
            ETF PORTFOLIO →
          </Link>
              <Link href="/positions" style={{ background: "#f59e0b18", border: "1px solid #f59e0b40", color: "#f59e0b", padding: "7px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em", textDecoration: "none", whiteSpace: "nowrap" }}>
  MY PORTFOLIO →
</Link>
        </div>
      </div>


      {/* Watchlist */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, borderBottom: "1px solid #1a2a3a", flexWrap: "wrap", overflowX: "auto" }}>
        {WATCHLIST.map((w) => (
          <button key={w} onClick={() => { setInput(w); fetchStock(w); }}
            style={{ background: ticker === w ? "#00ff8812" : "transparent", border: `1px solid ${ticker === w ? "#00ff8840" : "#1a2a3a"}`, color: ticker === w ? "#00ff88" : "#3d5a70", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            {w}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: "10px 16px", padding: "8px 12px", background: "#ff45600d", border: "1px solid #ff456028", borderRadius: 6, fontSize: 10, color: "#ff8080" }}>
          ⚠ {error}
        </div>
      )}

      {/* Spinner */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
          <div style={{ width: 30, height: 30, border: "2px solid #1a2a3a", borderTop: "2px solid #00ff88", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 9, color: "#2d4050", letterSpacing: "0.2em" }}>LOADING {ticker}...</div>
        </div>
      )}

      {/* Main content */}
      {data && mods && !loading && (
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 800, margin: "0 auto" }} className="fade-in">

          {/* Price header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>{data.symbol}</div>
              <div style={{ color: "#3d5a70", fontSize: 10, marginTop: 2 }}>{data.name}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700 }}>${data.price?.toFixed(2)}</div>
              <div style={{ color: isUp ? "#4ade80" : "#ff6b6b", fontSize: 12, fontWeight: 700 }}>{isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(2)}%</div>
            </div>
          </div>

          {/* 52W range */}
          <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#3d5a70", marginBottom: 6 }}>
              <span>52W LOW ${data.low52?.toFixed(2)}</span>
              <span>52W HIGH ${data.high52?.toFixed(2)}</span>
            </div>
            <div style={{ background: "#1a2a3a", borderRadius: 3, height: 5, position: "relative" }}>
              <div style={{ background: "linear-gradient(90deg,#ff6b6b22,#00ff8822)", borderRadius: 3, height: "100%", width: "100%" }} />
              <div style={{ position: "absolute", left: `${rangePos}%`, top: -3, width: 2, height: 11, background: "#00ff88", borderRadius: 1 }} />
            </div>
            <div style={{ textAlign: "center", marginTop: 5, fontSize: 8, color: "#5a7a8a" }}>
              {rangePos.toFixed(0)}% of 52-week range
            </div>
          </div>

          {/* AI Verdict */}
          {!verdict && !aiLoading && (
            <button onClick={fetchAI} style={{ background: "linear-gradient(135deg,#00ff8815,#00b8ff0d)", border: "1px solid #00ff8830", color: "#00ff88", padding: "14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "monospace", letterSpacing: "0.15em", fontWeight: 700, width: "100%" }}>
              ⚡ GENERATE AI VERDICT
            </button>
          )}

          {aiLoading && (
            <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 18, height: 18, border: "2px solid #1a2a3a", borderTop: "2px solid #00ff88", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              <span style={{ color: "#3d5a70", fontSize: 11, letterSpacing: "0.08em" }}>SYNTHESIZING SIGNALS WITH AI...</span>
            </div>
          )}

          {verdict && verdict.verdict !== "ERROR" && (
            <div style={{ background: `linear-gradient(135deg,${vc}08,#0a1220)`, border: `1px solid ${vc}28`, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }} className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em", marginBottom: 4 }}>AI VERDICT</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: vc }}>{verdict.verdict}</div>
                  <div style={{ color: "#7a8a9a", fontSize: 11, marginTop: 4, maxWidth: 300, lineHeight: 1.5 }}>{verdict.oneliner}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.1em" }}>CONVICTION</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: vc, lineHeight: 1.1 }}>
                    {verdict.conviction}<span style={{ fontSize: 14, color: "#3d5a70" }}>/10</span>
                  </div>
                  {verdict.priceTarget && (
                    <div style={{ fontSize: 9, color: "#3d5a70", marginTop: 3 }}>TARGET <span style={{ color: "#e2e8f0" }}>{verdict.priceTarget}</span></div>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 8, color: "#4ade80", letterSpacing: "0.1em", marginBottom: 6 }}>BULL CASE</div>
                  {verdict.bulls?.map((b, i) => (
                    <div key={i} style={{ fontSize: 10, color: "#7a8a9a", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid #4ade8030", lineHeight: 1.4 }}>▲ {b}</div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "#ff6b6b", letterSpacing: "0.1em", marginBottom: 6 }}>BEAR CASE</div>
                  {verdict.bears?.map((b, i) => (
                    <div key={i} style={{ fontSize: 10, color: "#7a8a9a", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid #ff6b6b30", lineHeight: 1.4 }}>▼ {b}</div>
                  ))}
                </div>
              </div>
              {verdict.keyRisk && (
                <div style={{ background: "#ff45600d", border: "1px solid #ff456028", borderRadius: 6, padding: "8px 12px", fontSize: 10, color: "#ff8080", lineHeight: 1.4 }}>
                  ⚠ KEY RISK: {verdict.keyRisk}
                </div>
              )}
              <button onClick={fetchAI} style={{ background: "transparent", border: "1px solid #1a2a3a", color: "#3d5a70", padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.07em", alignSelf: "flex-start" }}>
                ↻ REFRESH ANALYSIS
              </button>
            </div>
          )}

          {/* Model grid */}
          <div>
            <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 8 }}>QUANTITATIVE SIGNALS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>

              <Card title="GARCH VOL" badge={parseFloat(mods.garch.percentile) > 70 ? "HIGH VOL" : parseFloat(mods.garch.percentile) < 30 ? "LOW VOL" : "MED VOL"} spark={mods.garch.series} sparkColor="#f59e0b">
                <div style={{ fontSize: 22, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#f59e0b" }}>{mods.garch.current}%</div>
                <div style={{ fontSize: 8, color: "#3d5a70" }}>{mods.garch.percentile}th pct • annualized</div>
              </Card>

              <Card title="KALMAN TREND" badge={mods.kalman.direction} spark={mods.kalman.smoothed} sparkColor={mods.kalman.direction === "UP" ? "#4ade80" : mods.kalman.direction === "DOWN" ? "#ff6b6b" : "#94a3b8"}>
                <div style={{ fontSize: 22, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: mods.kalman.direction === "UP" ? "#4ade80" : mods.kalman.direction === "DOWN" ? "#ff6b6b" : "#94a3b8" }}>{mods.kalman.slope}%</div>
                <div style={{ fontSize: 8, color: "#3d5a70" }}>5-day slope</div>
              </Card>

              <Card title="HMM REGIME" badge={mods.hmm.regime}>
                <div style={{ fontSize: 22, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: mods.hmm.regime === "BULL" ? "#4ade80" : mods.hmm.regime === "BEAR" ? "#ff6b6b" : "#f59e0b" }}>{mods.hmm.regime}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 9 }}>
                  <span style={{ color: "#4ade80" }}>▲{mods.hmm.bullDays}d bull</span>
                  <span style={{ color: "#ff6b6b" }}>▼{mods.hmm.bearDays}d bear</span>
                </div>
              </Card>

              <Card title="MOMENTUM" badge={mods.momentum.signal}>
                {[["1M", mods.momentum.mom1m], ["3M", mods.momentum.mom3m], ["6M", mods.momentum.mom6m]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "#3d5a70" }}>{l}</span>
                    <span style={{ color: parseFloat(v) >= 0 ? "#4ade80" : "#ff6b6b", fontWeight: 700 }}>{v}%</span>
                  </div>
                ))}
              </Card>

              <Card title="RSI (14)" badge={mods.rsi.signal}>
                <div style={{ fontSize: 22, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: parseFloat(mods.rsi.value) > 70 ? "#ff6b6b" : parseFloat(mods.rsi.value) < 30 ? "#4ade80" : "#e2e8f0" }}>{mods.rsi.value}</div>
                <div style={{ background: "#1a2a3a", borderRadius: 3, height: 4, marginTop: 2 }}>
                  <div style={{ background: parseFloat(mods.rsi.value) > 70 ? "#ff6b6b" : parseFloat(mods.rsi.value) < 30 ? "#4ade80" : "#60a5fa", height: 4, borderRadius: 3, width: `${mods.rsi.value}%` }} />
                </div>
              </Card>

              <Card title="MACD" badge={mods.macd.crossover}>
                {[["Line", mods.macd.macd], ["Signal", mods.macd.signal], ["Hist", mods.macd.histogram]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: "#3d5a70" }}>{l}</span>
                    <span style={{ color: parseFloat(v) >= 0 ? "#4ade80" : "#ff6b6b" }}>{v}</span>
                  </div>
                ))}
              </Card>

              <Card title="MEAN REVERSION" badge={mods.meanRev.signal.includes("BUY") ? "BUY" : mods.meanRev.signal.includes("SELL") ? "SELL" : "NEUTRAL"}>
                <div style={{ fontSize: 20, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: parseFloat(mods.meanRev.zScore) > 1.5 ? "#ff6b6b" : parseFloat(mods.meanRev.zScore) < -1.5 ? "#4ade80" : "#e2e8f0" }}>Z: {mods.meanRev.zScore}</div>
                <div style={{ fontSize: 8, color: "#3d5a70" }}>${mods.meanRev.lower} – ${mods.meanRev.upper}</div>
              </Card>

              <Card title="FACTOR SCORES">
                <div style={{ display: "flex", justifyContent: "space-around", marginTop: 2 }}>
                  <Gauge value={parseFloat(mods.factors.value.score)} label="VALUE" color="#60a5fa" />
                  <Gauge value={parseFloat(mods.factors.quality.score)} label="QUAL" color="#a78bfa" />
                  <Gauge value={parseFloat(mods.factors.growth.score)} label="GROW" color="#34d399" />
                </div>
              </Card>

            </div>
          </div>

          {/* Fundamentals */}
          {Object.values(data.info).some(Boolean) && (
            <div>
              <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 8 }}>FUNDAMENTALS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  ["P/E", data.info?.trailingPE?.toFixed(1)],
                  ["P/B", data.info?.priceToBook?.toFixed(2)],
                  ["Rev Gr", data.info?.revenueGrowth ? `${(data.info.revenueGrowth * 100).toFixed(0)}%` : null],
                  ["Margin", data.info?.profitMargins ? `${(data.info.profitMargins * 100).toFixed(0)}%` : null],
                  ["ROE", data.info?.returnOnEquity ? `${(data.info.returnOnEquity * 100).toFixed(0)}%` : null],
                  ["D/E", data.info?.debtToEquity?.toFixed(1)],
                ].filter(([, v]) => v && v !== "NaN" && v !== "null").map(([label, value]) => (
                  <div key={label} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 7, color: "#2d4050", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 7, color: "#1a2a35", borderTop: "1px solid #0f1820", paddingTop: 10, letterSpacing: "0.06em" }}>
            NOT FINANCIAL ADVICE • EDUCATIONAL USE ONLY • DATA: YAHOO FINANCE
          </div>
        </div>
      )}
    </div>
  );
}
