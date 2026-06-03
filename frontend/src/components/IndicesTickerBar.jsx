import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { CaretUp, CaretDown } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Horizontal ticker bar showing live data for NIFTY 50, SENSEX, BANK NIFTY.
 * Tapping any index calls `onIndexClick(symbol, name)` so the parent can
 * open a "Top Options" sheet for that index.
 */
const IndicesTickerBar = ({ onIndexClick }) => {
  const [indices, setIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetchIndices = async () => {
    try {
      const res = await axios.get(`${API}/indices/live`);
      setIndices(res.data?.indices || []);
    } catch (e) {
      // silent — keep stale data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndices();
    intervalRef.current = setInterval(fetchIndices, 15000); // refresh every 15s
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading && indices.length === 0) {
    return (
      <div className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0B0B] px-2 py-2 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
        {[1, 2, 3].map((i) => (
          <div key={i} className="min-w-[140px] h-[44px] rounded-md bg-slate-200 dark:bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0B0B] px-2 py-2 flex gap-2 overflow-x-auto scrollbar-none shrink-0 transition-colors duration-200"
      data-testid="indices-ticker-bar"
    >
      {indices.map((idx) => {
        const up = (idx.change || 0) >= 0;
        const supportsOptions = idx.symbol === 'NIFTY' || idx.symbol === 'BANKNIFTY' || idx.symbol === 'SENSEX';
        return (
          <button
            key={idx.key}
            onClick={() => supportsOptions && onIndexClick?.(idx.symbol, idx.name)}
            disabled={!supportsOptions}
            className={`min-w-[150px] flex-shrink-0 text-left rounded-md border px-3 py-2 transition-all ${
              supportsOptions
                ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-[#00E676]/40 active:scale-[0.98] cursor-pointer'
                : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] opacity-70 cursor-not-allowed'
            }`}
            data-testid={`index-pill-${idx.key}`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-white/90 truncate">
                {idx.name}
              </span>
              {supportsOptions && (
                <span className="text-[8px] font-mono text-[#00E676]/80 ml-1">OPT</span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                {idx.price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span
                className={`text-[10px] font-mono font-semibold flex items-center gap-0.5 ${
                  up ? 'text-[#00E676]' : 'text-[#FF3D71]'
                }`}
              >
                {up ? <CaretUp size={9} weight="fill" /> : <CaretDown size={9} weight="fill" />}
                {Math.abs(idx.change_pct || 0).toFixed(2)}%
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default IndicesTickerBar;
