"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const CATEGORY_COLORS = { equity: "#4ade80", bond: "#60a5fa", alt: "#f59e0b", sector: "#a78bfa" };
const REGIME_COLORS   = { "BULL": "#4ade80", "BEAR": "#ff6b6b", "SIDEWAYS": "#f59e0b" };
const TREND_COLORS    = { "UP": "#4ade80", "DOWN": "#ff6b6b", "FLAT": "#94a3b8" };

function Badge({ text, color }) {
  const c = color || "#94a3b8";
  return (
    <span style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c, padding: "2px 6px", borderRadius: 3, fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

// Donut / arc chart for allocation
function AllocationDonut({ portfolio }) {
  const active = portfolio.filter(e => e.weight > 0.005);
  const size = 180, cx = 90, cy = 90, r = 70, stroke = 22;
  const circumference = 2 * Math.PI * r;

  // Build arcs
  const arcs = [];
  let offset = 0;
  active.forEach((e, i) => {
    const dash = e.weight * circumference;
    const gap  = circumference - dash;
    const color = CATEGORY_COLORS[e.category] || "#60a5fa";
    arcs.push({ ...e, dash, gap, offset: circumference - offset, color });
    offset += dash;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2a3a" strokeWidth={stroke} />
      {arcs.map((arc, i) => (
        <circle key={arc.sym} cx={cx} cy={cy} r={r} fill="none"
          stroke={arc.color} strokeWidth={stroke}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={arc.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontFamily="monospace" fontWeight="700">
        {active.length}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#3d5a70" fontSize="8" fontFamily="monospace" letterSpacing="0.1em">
        POSITIONS
      </text>
    </svg>
  );
}

// Horizontal bar for weight
function WeightBar({ weight, color }) {
  return (
    <div style={{ background: "#1a2a3a", borderRadius: 3, height: 5, width: "100%", minWidth: 60 }}>
      <div style={{ background: color, height: 5, borderRadius: 3, width: `${Math.min(100, weight * 100 / 0.35 * 100)}%`, transition: "width 0.5s ease" }} />
    </div>
  );
}

export default function PortfolioPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [view, setView]       = useState("allocation"); // allocation | signals

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/portfolio");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const regimeColor = data?.marketRegime === "RISK-ON" ? "#4ade80" : data?.marketRegime === "RISK-OFF" ? "#ff6b6b" : "#f59e0b";

  return (
    <div style={{ minHeight: "100vh", background: "#060c16", color: "#e2e8f0", fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.fade-in{animation:fadeIn 0.35s ease forwards}`}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2a3a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, position: "sticky", top: 0, background: "#060c16", zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#00ff88", letterSpacing: "-0.02em" }}>
            QUANT<span style={{ color: "#e2e8f0" }}>LENS</span>
          </div>
          <div style={{ fontSize: 7, color: "#1e3040", letterSpacing: "0.2em" }}>ETF PORTFOLIO OPTIMIZER</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/" style={{ color: "#3d5a70", fontSize: 10, textDecoration: "none", fontFamily: "monospace", letterSpacing: "0.08em", border: "1px solid #1a2a3a", padding: "5px 10px", borderRadius: 5 }}>
            ← STOCK ANALYZER
          </Link>
          <button onClick={load} style={{ background: "#00ff8812", border: "1px solid #00ff8830", color: "#00ff88", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em" }}>
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, borderBottom: "1px solid #1a2a3a" }}>
        {["allocation", "signals"].map(t => (
          <button key={t} onClick={() => setView(t)}
            style={{ background: view === t ? "#00ff8812" : "transparent", border: `1px solid ${view === t ? "#00ff8840" : "#1a2a3a"}`, color: view === t ? "#00ff88" : "#3d5a70", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 260, gap: 12 }}>
          <div style={{ width: 30, height: 30, border: "2px solid #1a2a3a", borderTop: "2px solid #00ff88", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 9, color: "#2d4050", letterSpacing: "0.2em" }}>FETCHING 12 ETFs & RUNNING MODELS...</div>
        </div>
      )}

      {error && (
        <div style={{ margin: "12px 16px", padding: "10px 14px", background: "#ff45600d", border: "1px solid #ff456028", borderRadius: 7, fontSize: 11, color: "#ff8080" }}>⚠ {error}</div>
      )}

      {data && !loading && (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 800, margin: "0 auto" }} className="fade-in">

          {/* Market regime banner */}
          <div style={{ background: `${regimeColor}0a`, border: `1px solid ${regimeColor}28`, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em", marginBottom: 3 }}>MARKET REGIME</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: regimeColor }}>{data.marketRegime}</div>
              <div style={{ fontSize: 9, color: "#5a7a8a", marginTop: 2 }}>{data.bullCount}/12 ETFs bullish signal</div>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.1em" }}>EXP. RETURN</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: parseFloat(data.expReturn) >= 0 ? "#4ade80" : "#ff6b6b" }}>{data.expReturn}%</div>
                <div style={{ fontSize: 7, color: "#3d5a70" }}>annualized</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.1em" }}>PORT. VOL</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{data.expVol}%</div>
                <div style={{ fontSize: 7, color: "#3d5a70" }}>annualized</div>
              </div>
            </div>
          </div>

          {/* AI Narrative */}
          {data.narrative && (
            <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em" }}>AI PORTFOLIO NARRATIVE</div>
              {data.narrative.regimeSummary && (
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: regimeColor }}>{data.narrative.regimeSummary}</div>
              )}
              <div style={{ fontSize: 11, color: "#8a9ab0", lineHeight: 1.6 }}>{data.narrative.narrative}</div>
              {data.narrative.topThesis && (
                <div style={{ background: "#00ff8808", border: "1px solid #00ff8820", borderRadius: 5, padding: "7px 10px", fontSize: 10, color: "#00ff88", lineHeight: 1.4 }}>
                  💡 {data.narrative.topThesis}
                </div>
              )}
            </div>
          )}

          {/* ALLOCATION VIEW */}
          {view === "allocation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Donut + legend */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <AllocationDonut portfolio={data.portfolio} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#5a7a8a" }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{cat}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 8, color: "#2d4050", marginTop: 4 }}>
                    Updated {new Date(data.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Allocation bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 4 }}>RECOMMENDED ALLOCATION</div>
                {data.portfolio.filter(e => e.weight > 0.005).map(e => (
                  <div key={e.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800 }}>{e.sym}</span>
                        <span style={{ fontSize: 9, color: "#3d5a70" }}>{e.name}</span>
                        <Badge text={e.category.toUpperCase()} color={CATEGORY_COLORS[e.category]} />
                      </div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: CATEGORY_COLORS[e.category] }}>
                        {(e.weight * 100).toFixed(0)}%
                      </div>
                    </div>
                    <WeightBar weight={e.weight} color={CATEGORY_COLORS[e.category]} />
                    <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#5a7a8a" }}>
                      <span>Mom: <span style={{ color: parseFloat(e.score.momScore) > 0 ? "#4ade80" : "#ff6b6b" }}>{e.score.momScore}</span></span>
                      <span>Regime: <span style={{ color: REGIME_COLORS[e.score.regime] }}>{e.score.regime}</span></span>
                      <span>Trend: <span style={{ color: TREND_COLORS[e.score.trend] }}>{e.score.trend}</span></span>
                      <span>RSI: <span style={{ color: parseFloat(e.score.rsi) > 70 ? "#ff6b6b" : parseFloat(e.score.rsi) < 30 ? "#4ade80" : "#e2e8f0" }}>{e.score.rsi}</span></span>
                    </div>
                  </div>
                ))}

                {/* Zero weight (excluded) */}
                {data.portfolio.filter(e => e.weight <= 0.005).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.15em", marginBottom: 6 }}>EXCLUDED (WEAK SIGNALS)</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {data.portfolio.filter(e => e.weight <= 0.005).map(e => (
                        <div key={e.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 6, padding: "5px 10px", fontSize: 10, color: "#3d5a70" }}>
                          {e.sym} <span style={{ fontSize: 8 }}>{e.score.regime}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SIGNALS VIEW */}
          {view === "signals" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 4 }}>ALL ETF SIGNALS</div>
              {data.portfolio.map(e => (
                <div key={e.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800 }}>{e.sym}</span>
                      <span style={{ fontSize: 9, color: "#3d5a70" }}>{e.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Badge text={e.score.regime} color={REGIME_COLORS[e.score.regime]} />
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: e.weight > 0.01 ? CATEGORY_COLORS[e.category] : "#3d5a70" }}>
                        {e.weight > 0.005 ? `${(e.weight * 100).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {[
                      ["1M MOM", e.score.mom1m + "%", parseFloat(e.score.mom1m) >= 0],
                      ["3M MOM", e.score.mom3m + "%", parseFloat(e.score.mom3m) >= 0],
                      ["6M MOM", e.score.mom6m + "%", parseFloat(e.score.mom6m) >= 0],
                      ["RSI",    e.score.rsi,          parseFloat(e.score.rsi) < 70],
                      ["VOL",    e.score.vol + "%",     parseFloat(e.score.vol) < 20],
                      ["SHARPE", e.score.sharpe,        parseFloat(e.score.sharpe) > 0],
                      ["TREND",  e.score.trend,         e.score.trend === "UP"],
                      ["SCORE",  e.score.composite.toFixed(1), e.score.composite > 0],
                    ].map(([label, val, positive]) => (
                      <div key={label} style={{ background: "#060c16", borderRadius: 5, padding: "5px 7px" }}>
                        <div style={{ fontSize: 7, color: "#2d4050", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: positive ? "#4ade80" : "#ff6b6b" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 7, color: "#1a2a35", borderTop: "1px solid #0f1820", paddingTop: 10, letterSpacing: "0.06em" }}>
            NOT FINANCIAL ADVICE • EDUCATIONAL USE ONLY • DATA: YAHOO FINANCE • AGGRESSIVE PROFILE
          </div>
        </div>
      )}
    </div>
  );
}
