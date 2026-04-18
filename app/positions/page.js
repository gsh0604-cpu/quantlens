"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Default positions ─────────────────────────────────────────────────────────
const DEFAULT_POSITIONS = [
  { sym: "NVDA",  shares: 10,  costBasis: 480.00 },
  { sym: "MSFT",  shares: 15,  costBasis: 380.00 },
  { sym: "ASML",  shares: 5,   costBasis: 750.00 },
  { sym: "META",  shares: 8,   costBasis: 350.00 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, dec = 2) { return n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUSD(n) { return n == null ? "—" : `$${fmt(Math.abs(n))}`; }
function fmtPct(n) { return n == null ? "—" : `${n >= 0 ? "+" : ""}${fmt(n)}%`; }

function Badge({ text, color }) {
  const c = color || "#94a3b8";
  return <span style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c, padding: "2px 7px", borderRadius: 3, fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{text}</span>;
}

function EarningsChip({ days }) {
  if (days == null) return null;
  if (days < 0) return <Badge text="EARNINGS PAST" color="#5a7a9a" />;
  if (days <= 14) return <Badge text={`EARNINGS ${days}D`} color="#ff4560" />;
  if (days <= 30) return <Badge text={`EARNINGS ${days}D`} color="#ff6b6b" />;
  if (days <= 45) return <Badge text={`EARNINGS ${days}D`} color="#f59e0b" />;
  return <Badge text={`EARNINGS ${days}D`} color="#5a7a8a" />;
}

// ── Covered Call Recommendation ───────────────────────────────────────────────
function CoveredCallPanel({ sym, price, costBasis, shares, earningsData }) {
  const [open, setOpen] = useState(false);
  if (!earningsData?.options) return null;

  const { ccStrikes, iv, expectedMove, expirations, targetExpiries } = earningsData.options;
  const daysToEarnings = earningsData.daysToEarnings;

  // Filter strikes above cost basis
  const safeCalls = ccStrikes.filter(c => c.strike >= costBasis);
  const bestCalls = safeCalls.slice(0, 5);

  const annualIncome = (strike, bid, dte) => {
    if (!bid || !dte) return null;
    return ((bid / price) * (365 / dte) * 100).toFixed(1);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ background: open ? "#a78bfa18" : "transparent", border: "1px solid #a78bfa33", color: "#a78bfa", padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em" }}>
        {open ? "▲" : "▼"} COVERED CALL ANALYZER
      </button>

      {open && (
        <div style={{ marginTop: 8, background: "#060c16", border: "1px solid #1a2a3a", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* IV + Expected Move */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 6, padding: "7px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 7, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 2 }}>IMPLIED VOL</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "#f59e0b" }}>{iv ? `${iv}%` : "—"}</div>
            </div>
            <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 6, padding: "7px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 7, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 2 }}>EXP MOVE (30D)</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "#60a5fa" }}>{expectedMove ? `±$${expectedMove}` : "—"}</div>
            </div>
            <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 6, padding: "7px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 7, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 2 }}>COST BASIS</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "#4ade80" }}>${fmt(costBasis)}</div>
            </div>
          </div>

          {/* Earnings warning */}
          {daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 45 && (
            <div style={{ background: "#f59e0b0d", border: "1px solid #f59e0b30", borderRadius: 6, padding: "7px 10px", fontSize: 10, color: "#f59e0b", lineHeight: 1.4 }}>
              ⚠ EARNINGS IN {daysToEarnings} DAYS ({earningsData.earningsDate}) — Avoid selling calls that expire after this date unless you want to risk assignment through earnings.
            </div>
          )}

          {/* Target expiries */}
          {targetExpiries?.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 5 }}>30–45 DTE EXPIRIES</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {targetExpiries.map(e => {
                  const spansEarnings = daysToEarnings != null && daysToEarnings >= 0 && e.dte > daysToEarnings;
                  return (
                    <div key={e.timestamp} style={{ background: spansEarnings ? "#ff456010" : "#0a1220", border: `1px solid ${spansEarnings ? "#ff456040" : "#1a2a3a"}`, borderRadius: 5, padding: "4px 8px", fontSize: 10, color: spansEarnings ? "#ff8080" : "#e2e8f0" }}>
                      {e.date} <span style={{ fontSize: 8, color: spansEarnings ? "#ff6b6b" : "#3d5a70" }}>{e.dte}d {spansEarnings ? "⚠SPANS EARNINGS" : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strike table */}
          {bestCalls.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 6 }}>
                CALL STRIKES ABOVE COST BASIS ({shares} contracts = {shares * 100} shares)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "70px 55px 55px 55px 70px", gap: 4, fontSize: 8, color: "#3d5a70", letterSpacing: "0.08em", paddingBottom: 4, borderBottom: "1px solid #1a2a3a" }}>
                  <span>STRIKE</span><span>BID</span><span>ASK</span><span>IV</span><span>ANN YIELD</span>
                </div>
                {bestCalls.map((c, i) => {
                  const otm = (((c.strike - price) / price) * 100).toFixed(1);
                  const yield_ = annualIncome(c.strike, c.bid, c.dte);
                  const isRecommended = i === 1 || i === 2; // highlight middle strikes
                  return (
                    <div key={c.strike} style={{ display: "grid", gridTemplateColumns: "70px 55px 55px 55px 70px", gap: 4, padding: "5px 6px", background: isRecommended ? "#a78bfa0a" : "transparent", border: `1px solid ${isRecommended ? "#a78bfa22" : "transparent"}`, borderRadius: 4, alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>${c.strike}</span>
                        <span style={{ fontSize: 8, color: "#3d5a70", marginLeft: 3 }}>+{otm}%</span>
                        {isRecommended && <span style={{ fontSize: 7, color: "#a78bfa", marginLeft: 3 }}>★</span>}
                      </div>
                      <span style={{ fontSize: 11, color: "#4ade80" }}>${fmt(c.bid)}</span>
                      <span style={{ fontSize: 11, color: "#5a7a8a" }}>${fmt(c.ask)}</span>
                      <span style={{ fontSize: 10, color: "#f59e0b" }}>{c.iv?.toFixed(0)}%</span>
                      <span style={{ fontSize: 11, color: yield_ > 20 ? "#4ade80" : yield_ > 10 ? "#f59e0b" : "#5a7a8a", fontWeight: 700 }}>{yield_ ? `${yield_}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 8, color: "#2d4050", marginTop: 6 }}>★ = recommended strikes • Ann. Yield = (bid/price) × (365/DTE) × 100</div>
            </div>
          )}

          {bestCalls.length === 0 && (
            <div style={{ fontSize: 10, color: "#3d5a70" }}>No strikes found above cost basis of ${fmt(costBasis)}. Stock may be below cost basis.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Position Modal ────────────────────────────────────────────────────────
function AddPositionModal({ onAdd, onClose }) {
  const [sym, setSym]     = useState("");
  const [shares, setShares]     = useState("");
  const [basis, setBasis] = useState("");

  const submit = () => {
    if (!sym || !shares || !basis) return;
    onAdd({ sym: sym.toUpperCase().trim(), shares: parseFloat(shares), costBasis: parseFloat(basis) });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 12, padding: 20, width: 280, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800 }}>ADD POSITION</div>
        {[["TICKER", sym, setSym, "AAPL"], ["SHARES", shares, setShares, "100"], ["COST BASIS $", basis, setBasis, "150.00"]].map(([label, val, set, ph]) => (
          <div key={label}>
            <div style={{ fontSize: 8, color: "#3d5a70", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
            <input value={val} onChange={e => set(label === "TICKER" ? e.target.value.toUpperCase() : e.target.value)}
              placeholder={ph} style={{ background: "#060c16", border: "1px solid #1a2a3a", borderRadius: 5, padding: "7px 10px", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", width: "100%", outline: "none" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={submit} style={{ flex: 1, background: "#00ff8818", border: "1px solid #00ff8840", color: "#00ff88", padding: "9px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>ADD</button>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid #1a2a3a", color: "#3d5a70", padding: "9px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PositionsPage() {
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [prices, setPrices]       = useState({});
  const [earnings, setEarnings]   = useState({});
  const [loading, setLoading]     = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [activeTab, setActiveTab] = useState("portfolio"); // portfolio | earnings

  // Load positions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ql_positions");
      if (saved) setPositions(JSON.parse(saved));
    } catch (_) {}
  }, []);

  // Save positions to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem("ql_positions", JSON.stringify(positions)); } catch (_) {}
  }, [positions]);

  const refresh = useCallback(async () => {
    if (positions.length === 0) return;
    setLoading(true);
    const tickers = positions.map(p => p.sym);

    // Fetch prices
    const priceRes = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    if (priceRes.ok) setPrices(await priceRes.json());

    // Fetch earnings + options for each position
    const earningsResults = await Promise.allSettled(
      tickers.map(t => fetch(`/api/earnings?sym=${t}`).then(r => r.json()))
    );
    const earningsMap = {};
    earningsResults.forEach((r, i) => {
      if (r.status === "fulfilled") earningsMap[tickers[i]] = r.value;
    });
    setEarnings(earningsMap);
    setLoading(false);
  }, [positions]);

  useEffect(() => { refresh(); }, [refresh]);

  const addPosition = (pos) => {
    setPositions(prev => {
      const existing = prev.findIndex(p => p.sym === pos.sym);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = pos;
        return updated;
      }
      return [...prev, pos];
    });
  };

  const removePosition = (sym) => setPositions(prev => prev.filter(p => p.sym !== sym));

  // Portfolio summary
  const summary = positions.reduce((acc, p) => {
    const livePrice = prices[p.sym]?.price;
    if (!livePrice) return acc;
    const value    = livePrice * p.shares;
    const cost     = p.costBasis * p.shares;
    const gainLoss = value - cost;
    return { totalValue: acc.totalValue + value, totalCost: acc.totalCost + cost, totalGL: acc.totalGL + gainLoss };
  }, { totalValue: 0, totalCost: 0, totalGL: 0 });

  const totalReturn = summary.totalCost > 0 ? ((summary.totalGL / summary.totalCost) * 100) : 0;
  const earningsWarnings = positions.filter(p => earnings[p.sym]?.earningsWarning).length;

  return (
    <div style={{ minHeight: "100vh", background: "#060c16", color: "#e2e8f0", fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0}input:focus{outline:none}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}.fade-in{animation:fadeIn 0.3s ease forwards}`}</style>

      {showAdd && <AddPositionModal onAdd={addPosition} onClose={() => setShowAdd(false)} />}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2a3a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, position: "sticky", top: 0, background: "#060c16", zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#00ff88", letterSpacing: "-0.02em" }}>QUANT<span style={{ color: "#e2e8f0" }}>LENS</span></div>
          <div style={{ fontSize: 7, color: "#1e3040", letterSpacing: "0.2em" }}>PORTFOLIO TRACKER</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#3d5a70", fontSize: 9, textDecoration: "none", fontFamily: "monospace", letterSpacing: "0.07em", border: "1px solid #1a2a3a", padding: "5px 10px", borderRadius: 5 }}>← STOCKS</Link>
          <Link href="/portfolio" style={{ color: "#3d5a70", fontSize: 9, textDecoration: "none", fontFamily: "monospace", letterSpacing: "0.07em", border: "1px solid #1a2a3a", padding: "5px 10px", borderRadius: 5 }}>ETF OPTIMIZER</Link>
          <button onClick={() => setShowAdd(true)} style={{ background: "#00ff8818", border: "1px solid #00ff8840", color: "#00ff88", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>+ ADD</button>
          <button onClick={refresh} style={{ background: "transparent", border: "1px solid #1a2a3a", color: "#3d5a70", padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>↻</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, borderBottom: "1px solid #1a2a3a" }}>
        {["portfolio", "earnings"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background: activeTab === t ? "#00ff8812" : "transparent", border: `1px solid ${activeTab === t ? "#00ff8840" : "#1a2a3a"}`, color: activeTab === t ? "#00ff88" : "#3d5a70", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase", position: "relative" }}>
            {t}
            {t === "earnings" && earningsWarnings > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, background: "#ff4560", color: "#fff", borderRadius: "50%", width: 14, height: 14, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{earningsWarnings}</span>
            )}
          </button>
        ))}
      </div>

      {loading && positions.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 9, color: "#2d4050" }}>
          <div style={{ width: 14, height: 14, border: "2px solid #1a2a3a", borderTop: "2px solid #00ff88", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          FETCHING LIVE PRICES...
        </div>
      )}

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 800, margin: "0 auto" }}>

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === "portfolio" && (
          <>
            {/* Summary bar */}
            {summary.totalValue > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }} className="fade-in">
                {[
                  ["TOTAL VALUE",  `$${fmt(summary.totalValue, 0)}`, "#e2e8f0"],
                  ["TOTAL COST",   `$${fmt(summary.totalCost, 0)}`,  "#5a7a8a"],
                  ["TOTAL P&L",    `${summary.totalGL >= 0 ? "+" : ""}$${fmt(Math.abs(summary.totalGL), 0)} (${fmtPct(totalReturn)})`, summary.totalGL >= 0 ? "#4ade80" : "#ff6b6b"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 7, color: "#2d4050", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.2 }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Position cards */}
            {positions.map(p => {
              const live    = prices[p.sym];
              const price   = live?.price;
              const pctChg  = price && live.prevClose ? ((price - live.prevClose) / live.prevClose * 100) : null;
              const value   = price ? price * p.shares : null;
              const cost    = p.costBasis * p.shares;
              const gl      = value != null ? value - cost : null;
              const glPct   = gl != null ? (gl / cost * 100) : null;
              const earns   = earnings[p.sym];
              const isUp    = pctChg != null && pctChg >= 0;

              return (
                <div key={p.sym} style={{ background: "#0a1220", border: "1px solid #1a2a3a", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }} className="fade-in">

                  {/* Top row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800 }}>{p.sym}</span>
                        <span style={{ fontSize: 9, color: "#3d5a70" }}>{live?.name || ""}</span>
                        {earns && <EarningsChip days={earns.daysToEarnings} />}
                      </div>
                      <div style={{ fontSize: 9, color: "#3d5a70", marginTop: 3 }}>
                        {p.shares} shares @ ${fmt(p.costBasis)} cost basis
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {price ? (
                        <>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700 }}>${fmt(price)}</div>
                          <div style={{ fontSize: 11, color: isUp ? "#4ade80" : "#ff6b6b", fontWeight: 700 }}>{isUp ? "▲" : "▼"} {Math.abs(pctChg).toFixed(2)}%</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: "#3d5a70" }}>loading...</div>
                      )}
                    </div>
                  </div>

                  {/* P&L row */}
                  {value != null && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                      {[
                        ["POSITION VALUE", `$${fmt(value, 0)}`,"#e2e8f0"],
                        ["COST BASIS",     `$${fmt(cost, 0)}`,  "#5a7a8a"],
                        ["UNREALIZED P&L", `${gl >= 0 ? "+" : ""}$${fmt(Math.abs(gl), 0)}\n${fmtPct(glPct)}`, gl >= 0 ? "#4ade80" : "#ff6b6b"],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ background: "#060c16", borderRadius: 6, padding: "7px 8px" }}>
                          <div style={{ fontSize: 7, color: "#2d4050", letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.3, whiteSpace: "pre-line" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 52W range */}
                  {price && live?.high52 && live?.low52 && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#2d4050", marginBottom: 3 }}>
                        <span>52W LOW ${fmt(live.low52)}</span>
                        <span>52W HIGH ${fmt(live.high52)}</span>
                      </div>
                      <div style={{ background: "#1a2a3a", borderRadius: 3, height: 4, position: "relative" }}>
                        <div style={{ background: "linear-gradient(90deg,#ff6b6b22,#00ff8822)", borderRadius: 3, height: "100%", width: "100%" }} />
                        <div style={{ position: "absolute", left: `${Math.min(97, Math.max(3, ((price - live.low52) / (live.high52 - live.low52)) * 100))}%`, top: -2, width: 2, height: 8, background: "#00ff88", borderRadius: 1 }} />
                        {/* Cost basis marker */}
                        <div style={{ position: "absolute", left: `${Math.min(97, Math.max(3, ((p.costBasis - live.low52) / (live.high52 - live.low52)) * 100))}%`, top: -2, width: 2, height: 8, background: "#f59e0b", borderRadius: 1 }} />
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 7, color: "#2d4050", marginTop: 3 }}>
                        <span style={{ color: "#00ff88" }}>▲ current</span>
                        <span style={{ color: "#f59e0b" }}>▲ cost basis</span>
                      </div>
                    </div>
                  )}

                  {/* Covered call panel */}
                  {price && (
                    <CoveredCallPanel sym={p.sym} price={price} costBasis={p.costBasis} shares={p.shares} earningsData={earnings[p.sym]} />
                  )}

                  {/* Remove button */}
                  <button onClick={() => removePosition(p.sym)} style={{ background: "transparent", border: "none", color: "#2d4050", cursor: "pointer", fontSize: 9, fontFamily: "monospace", alignSelf: "flex-end", padding: "2px 0" }}>
                    ✕ remove
                  </button>
                </div>
              );
            })}

            {positions.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#3d5a70", fontSize: 12 }}>
                No positions yet. Click <span style={{ color: "#00ff88" }}>+ ADD</span> to get started.
              </div>
            )}
          </>
        )}

        {/* ── EARNINGS TAB ── */}
        {activeTab === "earnings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="fade-in">
            <div style={{ fontSize: 8, color: "#1e3040", letterSpacing: "0.2em", marginBottom: 4 }}>UPCOMING EARNINGS</div>
            {positions.map(p => {
              const e = earnings[p.sym];
              const live = prices[p.sym];
              const days = e?.daysToEarnings;
              const urgency = days != null && days >= 0 ? (days <= 14 ? "#ff4560" : days <= 30 ? "#ff6b6b" : days <= 45 ? "#f59e0b" : "#3d5a70") : "#2d4050";

              return (
                <div key={p.sym} style={{ background: "#0a1220", border: `1px solid ${days != null && days >= 0 && days <= 45 ? urgency + "40" : "#1a2a3a"}`, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800 }}>{p.sym}</span>
                      {e && <EarningsChip days={days} />}
                    </div>
                    <div style={{ fontSize: 10, color: "#5a7a8a" }}>
                      {e?.earningsDate ? `Next earnings: ${e.earningsDate}` : "Earnings date unknown"}
                    </div>
                    {days != null && days >= 0 && days <= 45 && (
                      <div style={{ fontSize: 9, color: "#f59e0b", marginTop: 3 }}>
                        ⚠ Review covered calls expiring after {e.earningsDate}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{live?.price ? `$${fmt(live.price)}` : "—"}</div>
                    <div style={{ fontSize: 9, color: "#3d5a70" }}>{p.shares} shares</div>
                  </div>
                </div>
              );
            })}

            {/* Calendar legend */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
              {[["≤14d", "#ff4560"], ["15–30d", "#ff6b6b"], ["31–45d", "#f59e0b"], [">45d", "#3d5a70"]].map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 7, color: "#1a2a35", borderTop: "1px solid #0f1820", paddingTop: 10, letterSpacing: "0.06em" }}>
          NOT FINANCIAL ADVICE • EDUCATIONAL USE ONLY • OPTIONS DATA: YAHOO FINANCE
        </div>
      </div>
    </div>
  );
}
