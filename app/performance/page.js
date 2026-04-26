"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const DEFAULT_POSITIONS = [
  { sym: "NVDA",  shares: 10,  costBasis: 480.00 },
  { sym: "MSFT",  shares: 15,  costBasis: 380.00 },
  { sym: "ASML",  shares: 5,   costBasis: 750.00 },
  { sym: "META",  shares: 8,   costBasis: 350.00 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n, d = 2) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtK = (n) => n == null ? "—" : n >= 1000000 ? `$${fmt(n/1000000)}M` : n >= 1000 ? `$${fmt(n/1000)}K` : `$${fmt(n)}`;
const fmtPct = (n) => n == null ? "—" : `${parseFloat(n) >= 0 ? "+" : ""}${fmt(n)}%`;
const clr = (n) => parseFloat(n) >= 0 ? "#4ade80" : "#ff6b6b";

// ── Mini SVG line chart ───────────────────────────────────────────────────────
function LineChart({ series, colors, height = 120, showZero = false }) {
  if (!series || series.length === 0 || !series[0]?.data?.length) return null;
  const w = 320, h = height;
  const allVals = series.flatMap(s => s.data).filter(v => v != null);
  if (allVals.length < 2) return null;
  const mn = Math.min(...allVals), mx = Math.max(...allVals), range = mx - mn || 1;
  const x = (i, len) => (i / (len - 1)) * w;
  const y = (v) => h - ((v - mn) / range) * (h - 8) - 4;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {/* Zero line */}
      {showZero && mn < 0 && mx > 0 && (
        <line x1={0} y1={y(0)} x2={w} y2={y(0)} stroke="#2d4050" strokeWidth="1" strokeDasharray="4 3" />
      )}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => `${x(i, s.data.length)},${y(v)}`).join(" ");
        return (
          <polyline key={si} points={pts} fill="none" stroke={colors[si]} strokeWidth="1.8" strokeLinejoin="round" />
        );
      })}
      {/* Start/end labels */}
      {series[0] && (
        <>
          <text x={4} y={y(series[0].data[0]) - 4} fill="#3d5a70" fontSize="8" fontFamily="monospace">{fmt(series[0].data[0], 1)}</text>
          <text x={w - 4} y={y(series[0].data[series[0].data.length-1]) - 4} fill={colors[0]} fontSize="8" fontFamily="monospace" textAnchor="end">{fmt(series[0].data[series[0].data.length-1], 1)}</text>
        </>
      )}
    </svg>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function Stat({ label, value, color, sub }) {
  return (
    <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "9px 11px" }}>
      <div style={{ fontSize: 7, color: "#2d4050", letterSpacing: "0.12em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || "#e2e8f0", fontFamily: "'Syne',sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: "#3d5a70", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Drawdown bar ──────────────────────────────────────────────────────────────
function DrawdownBar({ value }) {
  const v = Math.abs(parseFloat(value) || 0);
  const color = v >= 15 ? "#ff4560" : v >= 10 ? "#f59e0b" : v >= 5 ? "#60a5fa" : "#4ade80";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ flex: 1, background: "#1a2a3a", borderRadius: 3, height: 5 }}>
        <div style={{ background: color, height: 5, borderRadius: 3, width: `${Math.min(100, v / 30 * 100)}%`, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 44, textAlign: "right" }}>{parseFloat(value) > 0 ? "+" : ""}{value}%</span>
    </div>
  );
}

// ── Return comparison row ─────────────────────────────────────────────────────
function ReturnRow({ label, portVal, spyVal }) {
  const p = parseFloat(portVal), s = parseFloat(spyVal);
  const alpha = !isNaN(p) && !isNaN(s) ? (p - s).toFixed(1) : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 70px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #0f1820" }}>
      <span style={{ fontSize: 9, color: "#3d5a70", letterSpacing: "0.07em" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: clr(portVal) }}>{fmtPct(portVal)}</span>
      <span style={{ fontSize: 12, color: clr(spyVal) }}>{fmtPct(spyVal)}</span>
      {alpha !== null && (
        <span style={{ fontSize: 10, color: parseFloat(alpha) >= 0 ? "#4ade80" : "#ff6b6b", fontWeight: 700, textAlign: "right" }}>
          {parseFloat(alpha) >= 0 ? "+" : ""}{alpha}%
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [view, setView]     = useState("overview"); // overview | positions | drawdown

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    // Load positions from localStorage or use defaults
    let positions = DEFAULT_POSITIONS;
    try {
      const saved = localStorage.getItem("ql_positions");
      if (saved) positions = JSON.parse(saved);
    } catch (_) {}

    try {
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const port = data?.portfolio;
  const bench = data?.benchmark;
  const dd = data?.drawdown;

  // Weighted position returns for comparison table
  const portReturns = data ? {
    ret1m:  data.positions.filter(p => p.returns?.ret1m != null).reduce((s, p) => s + p.returns.ret1m * (p.currentValue / (port?.totalValue || 1)), 0),
    ret3m:  data.positions.filter(p => p.returns?.ret3m != null).reduce((s, p) => s + p.returns.ret3m * (p.currentValue / (port?.totalValue || 1)), 0),
    ret6m:  data.positions.filter(p => p.returns?.ret6m != null).reduce((s, p) => s + p.returns.ret6m * (p.currentValue / (port?.totalValue || 1)), 0),
    ret1y:  data.positions.filter(p => p.returns?.ret1y != null).reduce((s, p) => s + p.returns.ret1y * (p.currentValue / (port?.totalValue || 1)), 0),
  } : null;

  const hasCritical = dd?.criticalPositions?.length > 0;
  const hasWarning  = dd?.warningPositions?.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#060c16", color: "#e2e8f0", fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}.fade-in{animation:fadeIn 0.3s ease forwards}`}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2a3a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, position: "sticky", top: 0, background: "#060c16", zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#00ff88", letterSpacing: "-0.02em" }}>QUANT<span style={{ color: "#e2e8f0" }}>LENS</span></div>
          <div style={{ fontSize: 7, color: "#1e3040", letterSpacing: "0.2em" }}>PERFORMANCE & BENCHMARK</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/"          style={{ color: "#3d5a70", fontSize: 9, textDecoration: "none", border: "1px solid #1a2a3a", padding: "5px 10px", borderRadius: 5, fontFamily: "monospace" }}>← STOCKS</Link>
          <Link href="/positions" style={{ color: "#f59e0b", fontSize: 9, textDecoration: "none", border: "1px solid #f59e0b30", padding: "5px 10px", borderRadius: 5, fontFamily: "monospace" }}>MY PORTFOLIO</Link>
          <Link href="/portfolio" style={{ color: "#a78bfa", fontSize: 9, textDecoration: "none", border: "1px solid #a78bfa30", padding: "5px 10px", borderRadius: 5, fontFamily: "monospace" }}>ETF OPTIMIZER</Link>
          <button onClick={load} style={{ background: "#00ff8812", border: "1px solid #00ff8830", color: "#00ff88", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>↻</button>
        </div>
      </div>

      {/* Alert banner */}
      {(hasCritical || hasWarning) && !loading && (
        <div style={{ padding: "8px 16px", background: hasCritical ? "#ff456010" : "#f59e0b0d", borderBottom: `1px solid ${hasCritical ? "#ff456030" : "#f59e0b30"}`, display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: hasCritical ? "#ff8080" : "#f59e0b" }}>
          ⚠ {hasCritical ? `CRITICAL DRAWDOWN: ${dd.criticalPositions.join(", ")} down >15% from peak` : `WARNING: ${dd.warningPositions.join(", ")} down >10% from peak`}
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, borderBottom: "1px solid #1a2a3a" }}>
        {["overview", "positions", "drawdown"].map(t => (
          <button key={t} onClick={() => setView(t)}
            style={{ background: view === t ? "#00ff8812" : "transparent", border: `1px solid ${view === t ? "#00ff8840" : "#1a2a3a"}`, color: view === t ? "#00ff88" : "#3d5a70", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "2px solid #1a2a3a", borderTop: "2px solid #00ff88", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 9, color: "#2d4050", letterSpacing: "0.2em" }}>CALCULATING PERFORMANCE...</div>
        </div>
      )}
      {error && <div style={{ margin: "12px 16px", padding: "10px", background: "#ff45600d", border: "1px solid #ff456028", borderRadius: 7, fontSize: 11, color: "#ff8080" }}>⚠ {error}</div>}

      {data && !loading && (
        <div style={{ padding: "14px 16px", maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }} className="fade-in">

          {/* ── OVERVIEW TAB ── */}
          {view === "overview" && (
            <>
              {/* Portfolio summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                <Stat label="PORTFOLIO VALUE"  value={fmtK(port?.totalValue)}   color="#e2e8f0" />
                <Stat label="TOTAL COST BASIS" value={fmtK(port?.totalCost)}    color="#5a7a8a" />
                <Stat label="TOTAL GAIN / LOSS" value={`${parseFloat(port?.totalGLPct) >= 0 ? "+" : ""}${fmt(port?.totalGLPct)}%`} color={clr(port?.totalGLPct)} sub={`${fmtK(port?.totalGL)} unrealized`} />
                <Stat label="PORTFOLIO ALPHA"  value={port?.alpha ? `${parseFloat(port.alpha) >= 0 ? "+" : ""}${fmt(port.alpha)}%` : "—"} color={clr(port?.alpha)} sub="vs SPY annualized" />
              </div>

              {/* Equity curve */}
              {port?.normalizedPrices?.length > 0 && (
                <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em" }}>EQUITY CURVE — LAST 60 DAYS (BASE = 100)</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: "#00ff88" }}>
                        <div style={{ width: 16, height: 2, background: "#00ff88", borderRadius: 1 }} /> PORTFOLIO
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: "#60a5fa" }}>
                        <div style={{ width: 16, height: 2, background: "#60a5fa", borderRadius: 1 }} /> SPY
                      </div>
                    </div>
                  </div>
                  <LineChart
                    series={[
                      { data: port.normalizedPrices },
                      { data: bench.normalizedPrices.slice(-port.normalizedPrices.length) },
                    ]}
                    colors={["#00ff88", "#60a5fa"]}
                    height={120}
                  />
                </div>
              )}

              {/* Returns comparison table */}
              <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.15em", marginBottom: 10 }}>RETURNS vs SPY BENCHMARK</div>
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 70px", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 8, color: "#2d4050" }}>PERIOD</span>
                  <span style={{ fontSize: 8, color: "#00ff88" }}>PORTFOLIO</span>
                  <span style={{ fontSize: 8, color: "#60a5fa" }}>SPY</span>
                  <span style={{ fontSize: 8, color: "#a78bfa", textAlign: "right" }}>ALPHA</span>
                </div>
                {portReturns && [
                  ["1M",  portReturns.ret1m,  bench.returns.ret1m],
                  ["3M",  portReturns.ret3m,  bench.returns.ret3m],
                  ["6M",  portReturns.ret6m,  bench.returns.ret6m],
                  ["1Y",  portReturns.ret1y,  bench.returns.ret1y],
                ].map(([label, pv, bv]) => (
                  <ReturnRow key={label} label={label} portVal={pv?.toFixed(2)} spyVal={bv?.toFixed(2)} />
                ))}
              </div>

              {/* Risk metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                <Stat label="PORTFOLIO BETA"   value={port?.beta ? fmt(port.beta) : "—"} color="#f59e0b" sub="vs SPY" />
                <Stat label="PORT SHARPE"      value={data.positions[0]?.sharpe || "—"}   color="#a78bfa" sub="risk-adj return" />
                <Stat label="SPY SHARPE"       value={bench.sharpe}                        color="#60a5fa" sub="benchmark" />
                <Stat label="PORT MAX DRAWDOWN" value={`${Math.min(...data.positions.filter(p=>p.drawdown).map(p=>parseFloat(p.drawdown.max)))}%`} color="#ff6b6b" />
                <Stat label="SPY MAX DRAWDOWN"  value={`${bench.drawdown.max}%`}           color="#60a5fa" />
                <Stat label="PORT DRAWDOWN NOW" value={`${dd?.portfolioDD}%`}              color={parseFloat(dd?.portfolioDD) < -10 ? "#ff6b6b" : "#4ade80"} />
              </div>
            </>
          )}

          {/* ── POSITIONS TAB ── */}
          {view === "positions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 4 }}>POSITION PERFORMANCE vs SPY</div>
              {data.positions.map(p => {
                if (p.error) return (
                  <div key={p.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: "#3d5a70" }}>{p.sym} — {p.error}</div>
                );
                const weight = port?.totalValue > 0 ? ((p.currentValue / port.totalValue) * 100).toFixed(1) : 0;
                return (
                  <div key={p.sym} style={{ background: "#0a1220", border: `1px solid ${p.drawdown?.isCritical ? "#ff456040" : p.drawdown?.isWarning ? "#f59e0b40" : "#1a2a3a"}`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800 }}>{p.sym}</span>
                          <span style={{ fontSize: 8, color: "#3d5a70", border: "1px solid #1a2a3a", padding: "1px 6px", borderRadius: 3 }}>{weight}% of portfolio</span>
                          {p.drawdown?.isCritical && <span style={{ fontSize: 8, color: "#ff4560", border: "1px solid #ff456040", padding: "1px 6px", borderRadius: 3 }}>⚠ CRITICAL</span>}
                          {p.drawdown?.isWarning  && <span style={{ fontSize: 8, color: "#f59e0b", border: "1px solid #f59e0b40", padding: "1px 6px", borderRadius: 3 }}>⚠ WARNING</span>}
                        </div>
                        <div style={{ fontSize: 9, color: "#3d5a70", marginTop: 2 }}>{p.shares} shares @ ${fmt(p.costBasis)} cost</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700 }}>${fmt(p.currentPrice)}</div>
                        <div style={{ fontSize: 10, color: clr(p.glPct), fontWeight: 700 }}>{fmtPct(p.glPct)}</div>
                      </div>
                    </div>

                    {/* Returns vs SPY */}
                    <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr 1fr 1fr", gap: 6 }}>
                      <span style={{ fontSize: 7, color: "#2d4050" }}></span>
                      {["1M","3M","6M","1Y"].map(l => <span key={l} style={{ fontSize: 7, color: "#2d4050", textAlign: "center" }}>{l}</span>)}
                      <span style={{ fontSize: 8, color: "#00ff88" }}>{p.sym}</span>
                      {[p.returns?.ret1m, p.returns?.ret3m, p.returns?.ret6m, p.returns?.ret1y].map((v, i) => (
                        <span key={i} style={{ fontSize: 10, fontWeight: 700, color: clr(v), textAlign: "center" }}>{v != null ? fmtPct(v.toFixed(1)) : "—"}</span>
                      ))}
                      <span style={{ fontSize: 8, color: "#60a5fa" }}>SPY</span>
                      {[bench.returns.ret1m, bench.returns.ret3m, bench.returns.ret6m, bench.returns.ret1y].map((v, i) => (
                        <span key={i} style={{ fontSize: 10, color: "#60a5fa", textAlign: "center" }}>{v != null ? fmtPct(parseFloat(v).toFixed(1)) : "—"}</span>
                      ))}
                    </div>

                    {/* Price chart */}
                    {p.normalizedPrices?.length > 0 && (
                      <LineChart
                        series={[
                          { data: p.normalizedPrices },
                          { data: bench.normalizedPrices.slice(-p.normalizedPrices.length) },
                        ]}
                        colors={["#00ff88", "#60a5fa"]}
                        height={80}
                      />
                    )}

                    {/* Alpha/Beta/Sharpe */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {[["ALPHA", `${parseFloat(p.alpha) >= 0 ? "+" : ""}${fmt(p.alpha)}%`, clr(p.alpha)],
                        ["BETA",  fmt(p.beta),  "#f59e0b"],
                        ["SHARPE", p.sharpe, "#a78bfa"],
                        ["GL",    fmtK(p.glAmt), clr(p.glAmt)],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ background: "#060c16", borderRadius: 5, padding: "5px 8px" }}>
                          <div style={{ fontSize: 7, color: "#2d4050", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── DRAWDOWN TAB ── */}
          {view === "drawdown" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 4 }}>DRAWDOWN MONITOR — 15% ALERT THRESHOLD</div>

              {/* Portfolio-level */}
              <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 8 }}>PORTFOLIO (WEIGHTED)</div>
                <DrawdownBar value={dd?.portfolioDD} />
                <div style={{ fontSize: 8, color: "#2d4050", marginTop: 6 }}>Current drawdown from weighted peak</div>
              </div>

              {/* Per position */}
              {data.positions.filter(p => p.drawdown).map(p => (
                <div key={p.sym} style={{ background: "#0a1220", border: `1px solid ${p.drawdown.isCritical ? "#ff456040" : p.drawdown.isWarning ? "#f59e0b40" : "#1a2a3a"}`, borderRadius: 9, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800 }}>{p.sym}</span>
                      {p.drawdown.isCritical && <span style={{ fontSize: 8, color: "#ff4560" }}>● CRITICAL &gt;15%</span>}
                      {p.drawdown.isWarning  && <span style={{ fontSize: 8, color: "#f59e0b" }}>● WARNING &gt;10%</span>}
                    </div>
                    <span style={{ fontSize: 9, color: "#3d5a70" }}>Peak ${p.drawdown.peak}</span>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#3d5a70", marginBottom: 4 }}>
                      <span>CURRENT DRAWDOWN</span>
                      <span>MAX 1Y DRAWDOWN</span>
                    </div>
                    <DrawdownBar value={p.drawdown.current} />
                    <div style={{ marginTop: 5 }}>
                      <DrawdownBar value={p.drawdown.max} />
                    </div>
                  </div>

                  {/* Drawdown chart */}
                  {p.drawdown.series?.length > 0 && (
                    <LineChart
                      series={[{ data: p.drawdown.series }]}
                      colors={[parseFloat(p.drawdown.current) < -15 ? "#ff4560" : parseFloat(p.drawdown.current) < -10 ? "#f59e0b" : "#4ade80"]}
                      height={60}
                      showZero={true}
                    />
                  )}
                </div>
              ))}

              {/* SPY drawdown for comparison */}
              <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 9, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 9, color: "#60a5fa", letterSpacing: "0.1em" }}>SPY BENCHMARK DRAWDOWN</div>
                <DrawdownBar value={bench.drawdown.current} />
                <div style={{ fontSize: 8, color: "#2d4050" }}>1Y Max: {bench.drawdown.max}% • Peak: ${bench.drawdown.peak}</div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 8 }}>
                {[["≥15% CRITICAL", "#ff4560"], ["10–15% WARNING", "#f59e0b"], ["5–10% CAUTION", "#60a5fa"], ["<5% HEALTHY", "#4ade80"]].map(([label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, color }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 7, color: "#1a2a35", borderTop: "1px solid #0f1820", paddingTop: 10, letterSpacing: "0.06em" }}>
            NOT FINANCIAL ADVICE • EDUCATIONAL USE ONLY • DATA: YAHOO FINANCE • POSITIONS FROM LOCAL STORAGE
          </div>
        </div>
      )}
    </div>
  );
}
