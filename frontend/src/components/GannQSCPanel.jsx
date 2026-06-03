/**
 * GannQSCPanel — Super-fast Gann × QSC Hybrid Signal
 *
 * Speed mechanism (ported from QSC Engine):
 *  1. Bars already fetched by chart → POST /api/gann-qsc/feed  (seeds RAM cache)
 *  2. GET /api/gann-qsc/signal/{ticker}  → reads purely from RAM, 0 I/O
 *  3. Typical compute: < 0.5 ms single-core  |  API roundtrip: < 5 ms
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;

/* ── helpers ──────────────────────────────────────────────────────── */
const fmt = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: dec });

const ScoreBar = ({ value, label }) => {
  const pct  = Math.abs(value) * 100;
  const pos  = value >= 0;
  const color = pos ? "#00E676" : "#FF5252";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-neutral-500 w-16 shrink-0 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: 0.85 }}
        />
      </div>
      <span className="text-[9px] font-mono w-10 text-right" style={{ color }}>
        {value >= 0 ? "+" : ""}{(value ?? 0).toFixed(3)}
      </span>
    </div>
  );
};

const OctaveTable = ({ levels, current }) => {
  if (!levels || !Object.keys(levels).length) return null;
  const entries = Object.entries(levels).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-0.5">
      {entries.map(([key, price]) => {
        const isR   = key.startsWith("R");
        const isNear = Math.abs((price - current) / current) < 0.005;
        return (
          <div
            key={key}
            className="flex items-center justify-between px-2 py-0.5 rounded-sm"
            style={{
              background: isNear ? "rgba(255,204,0,0.1)" : "transparent",
              border:     isNear ? "1px solid rgba(255,204,0,0.25)" : "1px solid transparent",
            }}
          >
            <span className="text-[8px] font-mono tracking-widest"
              style={{ color: isNear ? "#FFCC00" : isR ? "#FF5252" : "#00E676" }}>
              {key.replace("_", "/").replace(/(\d+)$/, "")}
            </span>
            <span className="text-[9px] font-mono text-white font-bold">{fmt(price)}</span>
            {isNear && <span className="text-[8px] text-yellow-400 font-bold">◄ NOW</span>}
          </div>
        );
      })}
    </div>
  );
};

/* ── main component ──────────────────────────────────────────────────────── */
export default function GannQSCPanel({ bars, ticker }) {
  const [signal, setSignal]     = useState(null);
  const [status, setStatus]     = useState("idle");  // idle | feeding | computing | done | error
  const [feedMs, setFeedMs]     = useState(null);
  const lastTicker              = useRef(null);
  const lastBarsLen             = useRef(0);

  const run = useCallback(async (sym, barData) => {
    if (!sym || !barData?.length) return;
    try {
      setStatus("feeding");

      const closes = barData.map(b => b.close);
      const highs  = barData.map(b => b.high  ?? b.close);
      const lows   = barData.map(b => b.low   ?? b.close);

      // Step 1 — feed RAM cache (fast POST, just arrays)
      const t0 = performance.now();
      await axios.post(`${API}/api/gann-qsc/feed`, { ticker: sym, closes, highs, lows });
      setFeedMs(Math.round(performance.now() - t0));

      // Step 2 — instant signal from RAM (no I/O)
      setStatus("computing");
      const t1  = performance.now();
      const res = await axios.get(`${API}/api/gann-qsc/signal/${sym}`);
      const sig = res.data;
      sig._req_ms = Math.round(performance.now() - t1);
      setSignal(sig);
      setStatus("done");
    } catch (e) {
      setStatus("error");
    }
  }, []);

  // Only re-run when ticker changes OR bars count changes significantly
  // Do NOT depend on bars reference (causes blink on every re-render)
  const barsLen = bars?.length ?? 0;
  useEffect(() => {
    if (!ticker || barsLen === 0) return;
    // Same ticker and same number of bars → already computed, skip
    if (ticker === lastTicker.current && barsLen === lastBarsLen.current) return;
    lastTicker.current = ticker;
    lastBarsLen.current = barsLen;
    run(ticker, bars);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, barsLen]);

  /* ── empty state ── */
  if (!ticker || !bars?.length) return null;

  const loading = status === "feeding" || status === "computing";

  const dirColor = signal?.direction === "LONG"  ? "#00E676"
                 : signal?.direction === "SHORT" ? "#FF5252"
                 : "#888";

  return (
    <div
      className="border rounded-sm overflow-hidden"
      style={{
        background: "rgba(0,0,0,0.55)",
        borderColor: signal ? `${dirColor}33` : "rgba(255,255,255,0.08)",
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Gann·QSC Engine
          </span>
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm"
            style={{ background: "rgba(51,102,255,0.15)", color: "#3366FF", border: "1px solid rgba(51,102,255,0.3)" }}
          >
            ⚡ IN-RAM
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[8px]">
          {loading ? (
            <span className="text-yellow-400 animate-pulse">
              {status === "feeding" ? "Seeding cache…" : "Computing…"}
            </span>
          ) : signal?.compute_ms != null ? (
            <span className="text-green-400 font-bold">
              ⚡ {signal.compute_ms} ms compute
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────── */}
      {loading && (
        <div className="px-3 py-4 text-center text-[10px] font-mono text-neutral-600 animate-pulse">
          Seeding in-memory cache…
        </div>
      )}

      {!loading && signal && !signal.error && (
        <div className="p-3 space-y-3">

          {/* Direction + Score */}
          <div className="flex items-center justify-between">
            <div>
              <span
                className="font-black text-3xl leading-none tracking-tight"
                style={{ color: dirColor }}
                data-testid="gqsc-direction"
              >
                {signal.strength}
              </span>
              <div className="text-[9px] font-mono text-neutral-500 mt-0.5">
                {signal.ticker}  ·  {fmt(signal.price)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">GannQSC</div>
              <div
                className="font-black text-xl font-mono"
                style={{ color: dirColor }}
              >
                {(Math.abs(signal.gqsc_score) * 100).toFixed(1)}
                <span className="text-xs text-neutral-500 font-normal">%</span>
              </div>
            </div>
          </div>

          {/* Score decomposition bars */}
          <div className="space-y-1.5">
            <ScoreBar value={signal.gann_score}    label="Gann 1×1" />
            <ScoreBar value={signal.quantum_score} label="Quantum"  />
            <ScoreBar value={signal.pearson_score} label="Pearson"  />
            <ScoreBar value={signal.momentum}      label="Momentum" />
          </div>

          {/* Intraday levels */}
          <div className="space-y-1 pt-1 border-t border-white/[0.06]">
            <div className="text-[8px] font-mono uppercase tracking-widest text-neutral-600 mb-1">
              Intraday Levels
            </div>
            {[
              { label: "ENTRY",     val: signal.price, color: "#fff"     },
              { label: "STOP LOSS", val: signal.sl,    color: "#FF5252"  },
              { label: "TARGET 1",  val: signal.t1,    color: "#00E676"  },
              { label: "TARGET 2",  val: signal.t2,    color: "#40C4FF"  },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-wider w-16">
                  {label}
                </span>
                <span className="font-mono text-[11px] font-bold" style={{ color }}>
                  {fmt(val)}
                </span>
                {val !== signal.price && (
                  <span className="text-[8px] font-mono" style={{ color }}>
                    {(((val - signal.price) / signal.price) * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Gann octave levels */}
          {signal.octave_levels && Object.keys(signal.octave_levels).length > 0 && (
            <div className="pt-1 border-t border-white/[0.06]">
              <div className="text-[8px] font-mono uppercase tracking-widest text-neutral-600 mb-1.5">
                Gann Octave Levels (1/8)
              </div>
              <OctaveTable levels={signal.octave_levels} current={signal.price} />
            </div>
          )}

          {/* Speed proof */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
            <span className="text-[8px] font-mono text-neutral-600">
              {signal.cache_bars} bars cached  ·  Engine: {signal.engine}
            </span>
            <span className="text-[8px] font-mono font-bold text-green-500">
              ⚡ {signal.compute_ms}ms
            </span>
          </div>
        </div>
      )}

      {!loading && signal?.error && (
        <div className="px-3 py-3 text-[10px] font-mono text-neutral-500">
          {signal.message}
        </div>
      )}
    </div>
  );
}
