import React, { useState, useEffect, useCallback } from 'react';
import { ArrowClockwise, CaretDown, CaretRight, TrendUp, TrendDown, Minus, Star, MagnifyingGlass } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/sector-picker`;

const QUADRANT_META = {
  Leading:   { color: '#00E676', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', desc: 'Outperforming + Positive Momentum', priority: 'P1' },
  Improving: { color: '#29B6F6', bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400',     desc: 'Underperforming but Improving',   priority: 'P2' },
  Weakening: { color: '#FFD93D', bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',  desc: 'Outperforming but Losing Steam', priority: 'P3' },
  Lagging:   { color: '#FF6B6B', bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-400',   desc: 'Underperforming + Negative Momentum', priority: 'P4' },
};

/* ─── Mini RRG SVG Chart ──────────────────────────────────────────── */
function RRGChart({ sectors }) {
  const W = 300; const H = 300;
  const PAD = 30;
  const cx = W / 2; const cy = H / 2;

  // Normalize RS values to SVG coordinates
  const allRS  = sectors.map(s => s.rs_ratio);
  const allRSM = sectors.map(s => s.rs_momentum);
  const rsMin = Math.min(98, ...allRS)  - 0.5;
  const rsMax = Math.max(102, ...allRS) + 0.5;
  const rsmMin = Math.min(98, ...allRSM)  - 0.5;
  const rsmMax = Math.max(102, ...allRSM) + 0.5;

  const toX = v => PAD + ((v - rsMin) / (rsMax - rsMin)) * (W - 2 * PAD);
  const toY = v => H - PAD - ((v - rsmMin) / (rsmMax - rsmMin)) * (H - 2 * PAD);
  const crossX = toX(100);
  const crossY = toY(100);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: 'transparent' }}>
      {/* Quadrant backgrounds */}
      <rect x={PAD} y={PAD} width={crossX - PAD} height={crossY - PAD} fill="#29B6F6" fillOpacity={0.07} />
      <rect x={crossX} y={PAD} width={W - PAD - crossX} height={crossY - PAD} fill="#00E676" fillOpacity={0.07} />
      <rect x={PAD} y={crossY} width={crossX - PAD} height={H - PAD - crossY} fill="#FF6B6B" fillOpacity={0.07} />
      <rect x={crossX} y={crossY} width={W - PAD - crossX} height={H - PAD - crossY} fill="#FFD93D" fillOpacity={0.07} />

      {/* Axes */}
      <line x1={PAD} y1={crossY} x2={W - PAD} y2={crossY} stroke="#ffffff20" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={crossX} y1={PAD} x2={crossX} y2={H - PAD} stroke="#ffffff20" strokeWidth={1} strokeDasharray="3 3" />

      {/* Quadrant labels */}
      <text x={PAD + 4} y={PAD + 14} fontSize={8} fill="#29B6F6" opacity={0.8}>IMPROVING</text>
      <text x={crossX + 4} y={PAD + 14} fontSize={8} fill="#00E676" opacity={0.8}>LEADING</text>
      <text x={PAD + 4} y={H - PAD - 6} fontSize={8} fill="#FF6B6B" opacity={0.8}>LAGGING</text>
      <text x={crossX + 4} y={H - PAD - 6} fontSize={8} fill="#FFD93D" opacity={0.8}>WEAKENING</text>

      {/* Trail lines */}
      {sectors.map(s => {
        if (!s.trail || s.trail.length < 2) return null;
        const pts = s.trail.map(p => `${toX(p.rs)},${toY(p.rsm)}`).join(' ');
        return (
          <polyline
            key={`trail-${s.sector}`}
            points={pts}
            fill="none"
            stroke={s.color}
            strokeWidth={1}
            strokeOpacity={0.35}
          />
        );
      })}

      {/* Sector dots */}
      {sectors.map(s => {
        const x = toX(s.rs_ratio);
        const y = toY(s.rs_momentum);
        return (
          <g key={s.sector} style={{ cursor: 'default' }}>
            <circle cx={x} cy={y} r={7} fill={s.color} fillOpacity={0.85} stroke="#000" strokeWidth={1} />
            <text x={x + 9} y={y + 4} fontSize={7} fill={s.color} fontWeight="bold">{s.sector.slice(0, 4)}</text>
          </g>
        );
      })}

      {/* Axis labels */}
      <text x={W - PAD} y={crossY + 12} fontSize={7} fill="#ffffff50" textAnchor="end">RS Ratio →</text>
      <text x={crossX - 4} y={PAD + 6} fontSize={7} fill="#ffffff50" textAnchor="end" transform={`rotate(-90, ${crossX - 4}, ${PAD + 6})`}>Momentum ↑</text>
    </svg>
  );
}

/* ─── Single stock row ────────────────────────────────────────────── */
function StockRow({ stock, onAddWatchlist, onSendScanner }) {
  const up = stock.change_pct >= 0;
  const volFmt = v => v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : `${(v / 1e3).toFixed(0)}K`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded transition-colors group" data-testid={`stock-row-${stock.symbol}`}>
      <div className="w-24 shrink-0">
        <span className="text-xs font-bold text-zinc-200">{stock.symbol}</span>
      </div>
      <div className="w-20 text-right shrink-0">
        <span className="text-xs font-mono text-zinc-200">₹{stock.price.toLocaleString('en-IN')}</span>
      </div>
      <div className={`w-16 text-right shrink-0 text-xs font-bold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {up ? '+' : ''}{stock.change_pct}%
      </div>
      <div className="w-16 text-right shrink-0 text-[10px] text-zinc-500">
        {volFmt(stock.volume)}
      </div>
      <div className="flex-1 text-[10px] text-zinc-500 truncate hidden xl:block">{stock.note}</div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onAddWatchlist(stock)}
          className="p-1 rounded hover:bg-amber-500/20 text-amber-400/60 hover:text-amber-400"
          title="Add to Watchlist"
          data-testid={`watchlist-btn-${stock.symbol}`}
        >
          <Star size={12} weight="fill" />
        </button>
        <button
          onClick={() => onSendScanner(stock)}
          className="p-1 rounded hover:bg-sky-500/20 text-sky-400/60 hover:text-sky-400"
          title="Load in Scanner"
          data-testid={`scanner-btn-${stock.symbol}`}
        >
          <MagnifyingGlass size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}

/* ─── Sector card (expandable) ────────────────────────────────────── */
function SectorCard({ sector, onAddWatchlist, onSendScanner }) {
  const [open, setOpen] = useState(false);
  const [stocks, setStocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const meta = QUADRANT_META[sector.quadrant] || QUADRANT_META.Lagging;

  const loadStocks = async () => {
    if (stocks !== null) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/stocks/${encodeURIComponent(sector.sector)}`);
      const d = await r.json();
      setStocks(d.stocks || []);
    } catch {
      setStocks([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open) loadStocks();
    setOpen(v => !v);
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${meta.border} ${meta.bg}`} data-testid={`sector-card-${sector.sector.replace(' ', '-')}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
        onClick={toggle}
        data-testid={`sector-toggle-${sector.sector.replace(' ', '-')}`}
      >
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: sector.color }} />
        <span className="flex-1 text-left text-xs font-bold text-zinc-200">{sector.sector}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${meta.text} ${meta.border} ${meta.bg}`}>
          {sector.quadrant}
        </span>
        <div className="text-right shrink-0 w-28">
          <span className="text-[10px] text-zinc-500 font-mono">RS {sector.rs_ratio} / RSM {sector.rs_momentum}</span>
        </div>
        {open ? <CaretDown size={12} className="text-zinc-500 shrink-0" /> : <CaretRight size={12} className="text-zinc-500 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/10">
          {/* Stock table header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            <div className="w-24">Symbol</div>
            <div className="w-20 text-right">Price</div>
            <div className="w-16 text-right">Change</div>
            <div className="w-16 text-right">Volume</div>
            <div className="flex-1 hidden xl:block">Signal</div>
            <div className="w-16 shrink-0" />
          </div>
          {loading && (
            <div className="px-4 py-4 text-xs text-zinc-500 animate-pulse">Loading stocks...</div>
          )}
          {!loading && stocks?.length === 0 && (
            <div className="px-4 py-3 text-xs text-zinc-500">No data available</div>
          )}
          {!loading && stocks?.map(s => (
            <StockRow key={s.symbol} stock={s} onAddWatchlist={onAddWatchlist} onSendScanner={onSendScanner} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────── */
export default function SectorRotationPicker({ onStockSelect }) {
  const [rrg, setRrg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [filterQ, setFilterQ] = useState('All');

  const fetchRRG = useCallback(async (force = false) => {
    setLoading(true);
    setErr(null);
    try {
      if (force) await fetch(`${API}/cache`, { method: 'DELETE' });
      const r = await fetch(`${API}/rrg`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRrg(d.data || []);
      setLastFetch(new Date());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRRG(); }, [fetchRRG]);

  const handleAddWatchlist = (stock) => {
    // Emit stock select so the search tab can pick it up
    onStockSelect?.({ ticker: stock.ticker, name: stock.symbol, type: 'STOCK' });
  };

  const handleSendScanner = (stock) => {
    onStockSelect?.({ ticker: stock.ticker, name: stock.symbol, type: 'STOCK' });
  };

  const quadrantCounts = rrg ? {
    Leading:   rrg.filter(s => s.quadrant === 'Leading').length,
    Improving: rrg.filter(s => s.quadrant === 'Improving').length,
    Weakening: rrg.filter(s => s.quadrant === 'Weakening').length,
    Lagging:   rrg.filter(s => s.quadrant === 'Lagging').length,
  } : {};

  const filtered = rrg ? (filterQ === 'All' ? rrg : rrg.filter(s => s.quadrant === filterQ)) : [];

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]" data-testid="sector-rotation-picker">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black tracking-tight text-zinc-100">Sector Rotation Picker</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            RRG analysis — Nifty Sectoral Indices vs Nifty 50 benchmark
            {lastFetch && <span className="ml-2 text-zinc-600">· {lastFetch.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button
          onClick={() => fetchRRG(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-zinc-100 hover:border-white/25 hover:bg-white/5 transition-all disabled:opacity-40"
          data-testid="refresh-picker-btn"
        >
          <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {err && (
          <div className="m-4 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs">
            Error: {err} — Check backend logs.
          </div>
        )}

        {loading && !rrg && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-xs text-zinc-500">Computing RRG — fetching 52 weeks of data...</p>
          </div>
        )}

        {rrg && (
          <div className="flex flex-col lg:flex-row gap-0 min-h-0">
            {/* LEFT — RRG Chart + Summary */}
            <div className="lg:w-72 xl:w-80 shrink-0 border-r border-white/10 p-4 flex flex-col gap-4">
              {/* Mini RRG */}
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden aspect-square">
                <RRGChart sectors={rrg} />
              </div>

              {/* Quadrant summary */}
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(QUADRANT_META).map(([q, meta]) => (
                  <button
                    key={q}
                    onClick={() => setFilterQ(prev => prev === q ? 'All' : q)}
                    className={`flex flex-col p-2.5 rounded-lg border transition-all ${
                      filterQ === q
                        ? `${meta.bg} ${meta.border} ring-1 ring-current`
                        : 'border-white/10 hover:border-white/20 bg-zinc-900/40'
                    }`}
                    data-testid={`quadrant-filter-${q.toLowerCase()}`}
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.text}`}>{q}</span>
                    <span className="text-xl font-black text-zinc-200">{quadrantCounts[q] ?? 0}</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5 leading-tight">{meta.desc}</span>
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="text-[10px] text-zinc-600 space-y-1">
                <p><span className="text-zinc-400 font-bold">RS Ratio</span> — Sector vs Nifty 50 (100 = parity)</p>
                <p><span className="text-zinc-400 font-bold">RS Momentum</span> — Speed of RS change (100 = neutral)</p>
                <p className="text-zinc-700">Rotation: Improving → Leading → Weakening → Lagging</p>
              </div>
            </div>

            {/* RIGHT — Sector list */}
            <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  {filterQ === 'All' ? `All ${rrg.length} Sectors` : `${filterQ} (${filtered.length})`}
                </span>
                {filterQ !== 'All' && (
                  <button
                    onClick={() => setFilterQ('All')}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                    data-testid="clear-filter-btn"
                  >
                    Show all
                  </button>
                )}
              </div>

              {filtered.map(s => (
                <SectorCard
                  key={s.sector}
                  sector={s}
                  onAddWatchlist={handleAddWatchlist}
                  onSendScanner={handleSendScanner}
                />
              ))}

              {filtered.length === 0 && (
                <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
                  No sectors in {filterQ} quadrant right now
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
