/**
 * RegulatoryWatchdogPanel
 * Standalone version for main Gann Trader — fetches its own data.
 * Same gauge as Hybrid Dashboard's RegulatoryGauge.
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Shield } from "@phosphor-icons/react";
import { useTheme } from "../context/ThemeContext";

const API = process.env.REACT_APP_BACKEND_URL;

export default function RegulatoryWatchdogPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();

  const fetch = async () => {
    try {
      const res = await axios.get(`${API}/api/hybrid/regulatory/sentiment`);
      setData(res.data);
    } catch {
      /* silent fail */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(id);
  }, []);

  const angle  = data ? (data.score + 1) / 2 * 180 - 90 : -90;
  const color  = !data ? "#888"
               : data.score >  0.2 ? "#3366FF"
               : data.score < -0.2 ? "#FF3333"
               : "#FFCC00";

  const tagColor = (w) => w > 0.3 ? "#3366FF" : w < -0.2 ? "#FF3333" : "#FFCC00";
  const nxStr    = (c) => `${c > 0 ? "+" : ""}${c}`;

  return (
    <div
      className="overflow-hidden"
      style={{
        background: theme === 'dark' ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.9)",
        border: `1px solid ${color}33`,
        borderRadius: 2,
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.07] dark:border-white/[0.07]">
        <Shield size={12} className="text-slate-400 dark:text-neutral-400" />
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
          Regulatory Watchdog
        </span>
        <span className="ml-auto text-[8px] font-mono text-slate-400 dark:text-neutral-600">GLOBAL + IN</span>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="p-3 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 bg-white/5 animate-pulse rounded" />
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      {!loading && data && (
        <div className="p-3">

          {/* Gauge */}
          <div className="relative w-full flex items-end justify-center" style={{ height: 84 }}>
            <svg viewBox="0 0 200 110" className="w-full h-full">
              {/* BG arc */}
              <path d="M 10 100 A 90 90 0 0 1 190 100"
                fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" strokeLinecap="round" />
              {/* Hostile zone (left) */}
              <path d="M 10 100 A 90 90 0 0 1 100 10"
                fill="none" stroke="rgba(255,51,51,0.22)" strokeWidth="14" strokeLinecap="butt" />
              {/* Neutral band */}
              <path d="M 85 11 A 90 90 0 0 1 115 11"
                fill="none" stroke="rgba(255,204,0,0.28)" strokeWidth="14" strokeLinecap="butt" />
              {/* Supportive zone (right) */}
              <path d="M 100 10 A 90 90 0 0 1 190 100"
                fill="none" stroke="rgba(51,102,255,0.22)" strokeWidth="14" strokeLinecap="butt" />
              {/* Needle */}
              <line
                x1="100" y1="100"
                x2={100 + 72 * Math.cos(((angle - 90) * Math.PI) / 180)}
                y2={100 + 72 * Math.sin(((angle - 90) * Math.PI) / 180)}
                stroke={color} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx="100" cy="100" r="5"  fill={color} />
              <circle cx="100" cy="100" r="2"  fill={theme === 'dark' ? "#0A0A0A" : "#FFFFFF"} />
              <text x="10"  y="115" fill="rgba(255,51,51,0.55)"  fontSize="9" fontFamily="monospace">HOSTILE</text>
              <text x="148" y="115" fill="rgba(51,102,255,0.55)" fontSize="9" fontFamily="monospace">SUPPORT</text>
            </svg>
          </div>

          {/* Label + score */}
          <div className="text-center mt-1 mb-2.5">
            <div className="text-lg font-black tracking-tight" style={{ color }}>
              {data.label}
            </div>
            <div className="text-[8px] font-mono text-neutral-500 mt-0.5">
              Score&nbsp;
              <span style={{ color }}>{nxStr(data.score)}</span>
              &nbsp;·&nbsp;Multiplier&nbsp;
              <span className="text-slate-700 dark:text-white">{data.aggressiveness_multiplier}×</span>
            </div>
          </div>

          {/* NSE/BSE row */}
          <div className="flex items-center gap-2 mb-2.5 px-2 py-1 bg-black/[0.025] dark:bg-white/[0.025] border border-black/[0.05] dark:border-white/[0.05]">
            <span className="text-[8px] font-mono text-neutral-600 uppercase tracking-wider">🇮🇳 NSE/BSE</span>
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[8px] font-mono font-bold" style={{ color }}>
              {data.score > 0.2 ? "POSITIVE FLOW" : data.score < -0.2 ? "RISK-OFF" : "NEUTRAL"}
            </span>
          </div>

          {/* Headlines */}
          <div className="space-y-2">
            {(data.headlines || []).slice(0, 4).map((h, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                  style={{ background: tagColor(h.weight) }}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[7px] font-bold uppercase tracking-widest text-neutral-500">
                    {h.src}
                  </span>
                  <p className="text-[9px] font-mono text-slate-600 dark:text-neutral-300 leading-snug mt-0.5 line-clamp-1"
                     title={h.headline}>
                    {h.headline}
                  </p>
                </div>
                <span
                  className="text-[9px] font-mono font-bold shrink-0"
                  style={{ color: tagColor(h.weight) }}
                >
                  {nxStr(h.weight)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
