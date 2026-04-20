"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const CATEGORY_COLORS = { equity: "#4ade80", bond: "#60a5fa", alt: "#f59e0b", sector: "#a78bfa" };
const REGIME_COLORS   = { BULL: "#4ade80", BEAR: "#ff6b6b", SIDEWAYS: "#f59e0b" };
const TREND_COLORS    = { UP: "#4ade80", DOWN: "#ff6b6b", FLAT: "#94a3b8" };

const PROFILES = [
  { key: "conservative", label: "Conservative", desc: "Capital preservation • Bonds ≥30%", color: "#60a5fa" },
  { key: "moderate",     label: "Moderate",     desc: "Balanced growth • Mixed",          color: "#a78bfa" },
  { key: "aggressive",   label: "Aggressive",   desc: "Max returns • Momentum-led",       color: "#00ff88" },
];

function Badge({ text, color }) {
  const c = color || "#94a3b8";
  return <span style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c, padding: "2px 6px", borderRadius: 3, fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{text}</span>;
}

function AllocationDonut({ portfolio }) {
  const active = portfolio.filter(e => e.weight > 0.005);
  const size = 160, cx = 80, cy = 80, r = 62, stroke = 20;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = active.map(e => {
    const dash = e.weight * circumference;
    const arc = { ...e, dash, gap: circumference - dash, offset: circumference - offset, color: CATEGORY_COLORS[e.category] || "#60a5fa" };
    offset += dash;
    return arc;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2a3a" strokeWidth={stroke} />
      {arcs.map(arc => (
        <circle key={arc.sym} cx={cx} cy={cy} r={r} fill="none" stroke={arc.color} strokeWidth={stroke}
          strokeDasharray={`${arc.dash} ${arc.gap}`} strokeDashoffset={arc.offset}
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.5s ease" }} />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontFamily="monospace" fontWeight="700">{active.length}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#3d5a70" fontSize="7" fontFamily="monospace" letterSpacing="0.1em">POSITIONS</text>
    </svg>
  );
}

export default function PortfolioPage() {
  const [profile, setProfile] = useState("aggressive");
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [view, setView]       = useState("allocation");

  const load = useCallback(async (p) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/portfolio?profile=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(profile); }, [profile, load]);

  const profileCfg = PROFILES.find(p => p.key === profile);
  const regimeColor = data?.marketRegime === "RISK-ON" ? "#4ade80" : data?.marketRegime === "RISK-OFF" ? "#ff6b6b" : "#f59e0b";

  return (
    <div style={{ minHeight: "100vh", background: "#060c16", color: "#e2e8f0", fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}.fade-in{animation:fadeIn 0.3s ease forwards}`}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2a3a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, position: "sticky", top: 0, background: "#060c16", zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#00ff88", letterSpacing: "-0.02em" }}>QUANT<span style={{ color: "#e2e8f0" }}>LENS</span></div>
          <div style={{ fontSize: 7, color: "#1e3040", letterSpacing: "0.2em" }}>ETF PORTFOLIO OPTIMIZER</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#3d5a70", fontSize: 9, textDecoration: "none", border: "1px solid #1a2a3a", padding: "5px 10px", borderRadius: 5, fontFamily: "monospace" }}>← STOCKS</Link>
          <Link href="/positions" style={{ color: "#f59e0b", fontSize: 9, textDecoration: "none", border: "1px solid #f59e0b30", padding: "5px 10px", borderRadius: 5, fontFamily: "monospace" }}>MY PORTFOLIO</Link>
          <button onClick={() => load(profile)} style={{ background: "#00ff8812", border: "1px solid #00ff8830", color: "#00ff88", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>↻ REFRESH</button>
        </div>
      </div>

      {/* Risk Profile Selector */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a2a3a" }}>
        <div style={{ fontSize: 8, color: "#2d4050", letterSpacing: "0.15em", marginBottom: 8 }}>RISK PROFILE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PROFILES.map(p => (
            <button key={p.key} onClick={() => setProfile(p.key)}
              style={{ background: profile === p.key ? `${p.color}18` : "transparent", border: `1px solid ${profile === p.key ? p.color + "55" : "#1a2a3a"}`, color: profile === p.key ? p.color : "#3d5a70", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "monospace", textAlign: "left", transition: "all 0.15s" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>{p.label}</div>
              <div style={{ fontSize: 8, opacity: 0.7, marginTop: 2 }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* View tabs */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, borderBottom: "1px solid #1a2a3a" }}>
        {["allocation", "signals"].map(t => (
          <button key={t} onClick={() => setView(t)}
            style={{ background: view === t ? "#00ff8812" : "transparent", border: `1px solid ${view === t ? "#00ff8840" : "#1a2a3a"}`, color: view === t ? "#00ff88" : "#3d5a70", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "2px solid #1a2a3a", borderTop: "2px solid #00ff88", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 9, color: "#2d4050", letterSpacing: "0.2em" }}>RUNNING MARKOWITZ + MOMENTUM OPTIMIZER...</div>
        </div>
      )}

      {error && <div style={{ margin: "12px 16px", padding: "10px 14px", background: "#ff45600d", border: "1px solid #ff456028", borderRadius: 7, fontSize: 11, color: "#ff8080" }}>⚠ {error}</div>}

      {data && !loading && (
        <div style={{ padding: "14px 16px", maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }} className="fade-in">

          {/* Regime + stats banner */}
          <div style={{ background: `${regimeColor}0a`, border: `1px solid ${regimeColor}28`, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em", marginBottom: 3 }}>MARKET REGIME • {data.profileLabel?.toUpperCase()} PROFILE</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: regimeColor }}>{data.marketRegime}</div>
              <div style={{ fontSize: 9, color: "#5a7a8a", marginTop: 2 }}>{data.bullCount}/5 ETFs bullish • Momentum + Markowitz</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {[["EXP. RETURN", `${data.expReturn}%`, parseFloat(data.expReturn) >= 0 ? "#4ade80" : "#ff6b6b"],
                ["VOLATILITY",  `${data.expVol}%`,    "#f59e0b"],
                ["SHARPE",      data.sharpe,           parseFloat(data.sharpe) > 0.5 ? "#4ade80" : "#94a3b8"]
              ].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 7, color: "#3d5a70", letterSpacing: "0.1em" }}>{label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Narrative */}
          {data.narrative && (
            <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em" }}>AI PORTFOLIO NARRATIVE</div>
              {data.narrative.regimeSummary && <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: regimeColor }}>{data.narrative.regimeSummary}</div>}
              <div style={{ fontSize: 11, color: "#8a9ab0", lineHeight: 1.6 }}>{data.narrative.narrative}</div>
              {data.narrative.topThesis && (
                <div style={{ background: "#00ff8808", border: "1px solid #00ff8820", borderRadius: 5, padding: "7px 10px", fontSize: 10, color: "#00ff88", lineHeight: 1.4 }}>💡 {data.narrative.topThesis}</div>
              )}
            </div>
          )}

          {/* ALLOCATION VIEW */}
          {view === "allocation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <AllocationDonut portfolio={data.portfolio} />
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#5a7a8a" }}>
                      <div style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.07em" }}>{cat}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 7, color: "#2d4050", marginTop: 3 }}>Updated {new Date(data.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>

              <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 2 }}>RECOMMENDED ALLOCATION — {data.profileLabel?.toUpperCase()}</div>

              {data.portfolio.map(e => {
                const color = CATEGORY_COLORS[e.category] || "#60a5fa";
                const pct = (e.weight * 100).toFixed(0);
                return (
                  <div key={e.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 9, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800 }}>{e.sym}</span>
                        <span style={{ fontSize: 9, color: "#3d5a70" }}>{e.name}</span>
                        <Badge text={e.category.toUpperCase()} color={color} />
                      </div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color }}>{pct}%</div>
                    </div>
                    {/* Weight bar */}
                    <div style={{ background: "#1a2a3a", borderRadius: 3, height: 4 }}>
                      <div style={{ background: color, height: 4, borderRadius: 3, width: `${Math.min(100, e.weight / 0.40 * 100)}%`, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#5a7a8a", flexWrap: "wrap" }}>
                      <span>Mom: <span style={{ color: parseFloat(e.score.momScore) > 0 ? "#4ade80" : "#ff6b6b" }}>{e.score.momScore}</span></span>
                      <span>Regime: <span style={{ color: REGIME_COLORS[e.score.regime] }}>{e.score.regime}</span></span>
                      <span>Trend: <span style={{ color: TREND_COLORS[e.score.trend] }}>{e.score.trend}</span></span>
                      <span>Sharpe: <span style={{ color: parseFloat(e.score.sharpe) > 0 ? "#4ade80" : "#ff6b6b" }}>{e.score.sharpe}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SIGNALS VIEW */}
          {view === "signals" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 4 }}>ALL ETF SIGNALS</div>
              {data.portfolio.map(e => (
                <div key={e.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "11px 13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800 }}>{e.sym}</span>
                      <span style={{ fontSize: 9, color: "#3d5a70" }}>{e.name}</span>
                      <Badge text={e.score.regime} color={REGIME_COLORS[e.score.regime]} />
                    </div>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: CATEGORY_COLORS[e.category] }}>
                      {(e.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
                    {[["1M", e.score.mom1m + "%", parseFloat(e.score.mom1m) >= 0],
                      ["3M", e.score.mom3m + "%", parseFloat(e.score.mom3m) >= 0],
                      ["6M", e.score.mom6m + "%", parseFloat(e.score.mom6m) >= 0],
                      ["RSI", e.score.rsi, parseFloat(e.score.rsi) < 70],
                      ["VOL", e.score.vol + "%", parseFloat(e.score.vol) < 20],
                      ["SHARPE", e.score.sharpe, parseFloat(e.score.sharpe) > 0],
                      ["TREND", e.score.trend, e.score.trend === "UP"],
                      ["SCORE", parseFloat(e.score.composite).toFixed(1), e.score.composite > 0],
                    ].map(([label, val, pos]) => (
                      <div key={label} style={{ background: "#060c16", borderRadius: 5, padding: "5px 7px" }}>
                        <div style={{ fontSize: 7, color: "#2d4050", letterSpacing: "0.07em", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: pos ? "#4ade80" : "#ff6b6b" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 7, color: "#1a2a35", borderTop: "1px solid #0f1820", paddingTop: 10, letterSpacing: "0.06em" }}>
            NOT FINANCIAL ADVICE • EDUCATIONAL USE ONLY • MODEL: MOMENTUM + MARKOWITZ MEAN-VARIANCE
          </div>
        </div>
      )}
    </div>
  );
}
