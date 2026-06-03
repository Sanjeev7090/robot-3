import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { TrendUp, TrendDown, ArrowsClockwise, CaretDown } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Generate a consistent color from ticker string
const tickerColor = (ticker) => {
  const colors = ['#60A5FA','#A78BFA','#34D399','#FBBF24','#F97316','#F472B6','#6EE7B7','#C084FC','#4ADE80','#FB7185','#38BDF8','#E879F9'];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// Stock card
const StockCard = ({ stock, onClick }) => {
  const isPos = stock.change_pct >= 0;
  const color = isPos ? '#00E676' : '#FF3B30';
  const sign = isPos ? '+' : '';
  const sym = stock.ticker.replace('.NS','').replace('.BO','');
  const bg = tickerColor(sym);
  const absChange = Math.abs((stock.price || 0) - (stock.prev_close || stock.price || 0)).toFixed(2);

  return (
    <button
      className="flex flex-col gap-2 p-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/8 rounded-xl transition-all hover:border-white/15 text-left w-full group"
      onClick={() => onClick(stock)}
      data-testid={`mover-card-${sym}`}
    >
      {/* Symbol badge */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0"
        style={{ backgroundColor: `${bg}20`, border: `1px solid ${bg}35`, color: bg }}
      >
        {sym.slice(0, 4)}
      </div>

      {/* Name */}
      <p className="text-[11px] font-semibold text-zinc-300 group-hover:text-white leading-tight line-clamp-2 transition-colors">
        {stock.name}
      </p>

      {/* Price */}
      <p className="text-[13px] font-black font-mono text-white mt-auto">
        {stock.price != null ? `₹${stock.price.toLocaleString('en-IN')}` : '—'}
      </p>

      {/* Change */}
      <p className="text-[11px] font-bold font-mono flex items-center gap-0.5" style={{ color }}>
        {isPos ? <TrendUp size={10} weight="bold" /> : <TrendDown size={10} weight="bold" />}
        {sign}{absChange} ({sign}{stock.change_pct.toFixed(2)}%)
      </p>
    </button>
  );
};

// Skeleton card
const SkeletonCard = () => (
  <div className="flex flex-col gap-2 p-3 bg-white/[0.04] border border-white/8 rounded-xl animate-pulse">
    <div className="w-9 h-9 rounded-xl bg-white/10" />
    <div className="h-3 bg-white/10 rounded w-4/5" />
    <div className="h-3 bg-white/10 rounded w-3/5 mt-1" />
    <div className="h-4 bg-white/10 rounded w-2/3 mt-1" />
    <div className="h-3 bg-white/10 rounded w-1/2" />
  </div>
);

// "Market trends" card — shows top 4 logos + label
const MarketTrendsCard = ({ stocks, onOpenAll }) => {
  const top4 = stocks.slice(0, 4);
  return (
    <button
      className="flex flex-col gap-2 p-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/8 rounded-xl transition-all hover:border-white/15 text-left w-full"
      onClick={onOpenAll}
      data-testid="market-trends-card"
    >
      <div className="grid grid-cols-2 gap-1.5">
        {top4.map(s => {
          const sym = s.ticker.replace('.NS','').replace('.BO','');
          const bg = tickerColor(sym);
          return (
            <div
              key={s.ticker}
              className="w-full aspect-square rounded-lg flex items-center justify-center text-[9px] font-black"
              style={{ backgroundColor: `${bg}22`, border: `1px solid ${bg}30`, color: bg }}
            >
              {sym.slice(0, 4)}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] font-semibold text-zinc-500 mt-auto flex items-center gap-1">
        Market trends <span className="text-zinc-600">›</span>
      </p>
    </button>
  );
};

// ---- Main Widget ----
const TopMoversWidget = ({ onStockSelect }) => {
  const [filter, setFilter] = useState('gainers'); // gainers | losers
  const [cap, setCap] = useState('large'); // large | mid | small
  const [stocks, setStocks] = useState([]);
  const [allStocks, setAllStocks] = useState([]); // full list for trends card
  const [loading, setLoading] = useState(false);
  const [showCapDrop, setShowCapDrop] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const CAP_LABELS = { large: 'Large cap', mid: 'Mid cap', small: 'Small cap' };

  const fetchMovers = useCallback(async () => {
    setLoading(true);
    try {
      const [mainRes, trendsRes] = await Promise.all([
        axios.get(`${API}/market/top-movers`, { params: { cap, filter, limit: 6 } }),
        axios.get(`${API}/market/top-movers`, { params: { cap, filter, limit: 20 } }),
      ]);
      setStocks(mainRes.data.stocks || []);
      setAllStocks(trendsRes.data.stocks || []);
    } catch (e) {
      console.error('Top movers error:', e);
    } finally {
      setLoading(false);
    }
  }, [cap, filter]);

  useEffect(() => {
    fetchMovers();
    const interval = setInterval(fetchMovers, 300000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchMovers]);

  // Close cap dropdown on outside click
  useEffect(() => {
    if (!showCapDrop) return;
    const close = () => setShowCapDrop(false);
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [showCapDrop]);

  const displayed = showAll ? stocks : stocks.slice(0, 3);

  return (
    <div className="border-b border-white/10" data-testid="top-movers-widget">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white">Top Movers</span>
        <button
          onClick={fetchMovers}
          disabled={loading}
          className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
          data-testid="refresh-movers"
        >
          <ArrowsClockwise size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter Row */}
      <div className="px-3 pb-2.5 flex items-center gap-2">
        {/* Gainers / Losers pills */}
        <div className="flex items-center bg-white/[0.05] rounded-full p-0.5 gap-0.5">
          {['gainers', 'losers'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold capitalize transition-all ${
                filter === f
                  ? f === 'gainers'
                    ? 'bg-[#00E676]/20 text-[#00E676]'
                    : 'bg-[#FF3B30]/20 text-[#FF3B30]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              data-testid={`filter-${f}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Cap dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={e => { e.stopPropagation(); setShowCapDrop(v => !v); }}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.06] border border-white/10 rounded-full text-[10px] font-semibold text-zinc-300 hover:bg-white/10 transition-colors"
            data-testid="cap-dropdown-btn"
          >
            {CAP_LABELS[cap]}
            <CaretDown size={9} className={`transition-transform ${showCapDrop ? 'rotate-180' : ''}`} />
          </button>
          {showCapDrop && (
            <div
              className="absolute right-0 top-full mt-1 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {Object.entries(CAP_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => { setCap(k); setShowCapDrop(false); }}
                  className={`block w-full text-left px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                    cap === k ? 'text-white bg-white/8' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                  }`}
                  data-testid={`cap-option-${k}`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="px-3 pb-3">
        {loading && stocks.length === 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : stocks.length === 0 ? (
          <p className="text-center text-[10px] text-zinc-600 py-6">
            {filter === 'gainers' ? 'Koi gainer nahi' : 'Koi loser nahi'} aaj
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {displayed.map(stock => (
                <StockCard
                  key={stock.ticker}
                  stock={stock}
                  onClick={(s) => onStockSelect && onStockSelect(s)}
                />
              ))}
              {/* Market Trends card — always last */}
              {!showAll && allStocks.length > 3 && (
                <MarketTrendsCard
                  stocks={allStocks.slice(3)}
                  onOpenAll={() => setShowAll(true)}
                />
              )}
            </div>

            {showAll && (
              <button
                onClick={() => setShowAll(false)}
                className="w-full mt-2 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 font-semibold transition-colors"
                data-testid="collapse-movers"
              >
                Show less ↑
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TopMoversWidget;
