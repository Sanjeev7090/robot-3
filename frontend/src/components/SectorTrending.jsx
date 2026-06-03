import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowsClockwise, CaretRight } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Icon map for each sector
const SECTOR_ICONS = {
  bank:    { icon: '🏦', color: '#60A5FA' },
  it:      { icon: '💻', color: '#A78BFA' },
  auto:    { icon: '🚗', color: '#FBBF24' },
  pharma:  { icon: '💊', color: '#34D399' },
  fmcg:    { icon: '🛒', color: '#F97316' },
  metal:   { icon: '⚙️', color: '#9CA3AF' },
  realty:  { icon: '🏠', color: '#F472B6' },
  energy:  { icon: '⚡', color: '#FCD34D' },
  infra:   { icon: '🏗️', color: '#6EE7B7' },
  media:   { icon: '📺', color: '#C084FC' },
  psubank: { icon: '🏛️', color: '#93C5FD' },
  midcap:  { icon: '📈', color: '#4ADE80' },
};

// ---- Single Sector Row ----
const SectorRow = ({ sector, maxAbs, onSelect }) => {
  const isPositive = sector.change_pct >= 0;
  const pctColor = isPositive ? '#00E676' : '#FF3B30';
  const barColor = isPositive ? '#00E676' : '#FF3B30';
  const barPct = maxAbs > 0 ? Math.min((Math.abs(sector.change_pct) / maxAbs) * 50, 50) : 0;
  const sign = isPositive ? '+' : '';
  const meta = SECTOR_ICONS[sector.icon] || { icon: '📊', color: '#9CA3AF' };

  return (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors rounded-lg group cursor-pointer"
      onClick={() => onSelect && onSelect(sector)}
      data-testid={`sector-row-${sector.icon}`}
    >
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ backgroundColor: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
      >
        <span>{meta.icon}</span>
      </div>

      {/* Name */}
      <span className="text-[11px] font-semibold text-zinc-300 flex-1 text-left truncate group-hover:text-white transition-colors">
        {sector.name.replace('NIFTY ', '')}
      </span>

      {/* Bar */}
      <div className="w-24 h-2 bg-white/8 rounded-full overflow-hidden flex-shrink-0 relative">
        {isPositive ? (
          <div
            className="absolute right-0 top-0 h-full rounded-full transition-all duration-700"
            style={{ width: `${barPct}%`, backgroundColor: barColor, right: '50%', left: 'auto' }}
          />
        ) : (
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-700"
            style={{ width: `${barPct}%`, backgroundColor: barColor, left: `${50 - barPct}%` }}
          />
        )}
        {/* Center divider */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
      </div>

      {/* % Change */}
      <span
        className="text-[11px] font-black font-mono w-[52px] text-right shrink-0"
        style={{ color: pctColor }}
        data-testid={`sector-change-${sector.icon}`}
      >
        {sign}{sector.change_pct}%
      </span>
    </button>
  );
};

// ---- Main Component ----
const SectorTrending = ({ onSectorSelect }) => {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchSectors = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/sectors/trending`);
      setSectors(data.sectors || []);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      /* silent fail */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectors();
    // Refresh every 5 minutes
    const interval = setInterval(fetchSectors, 300000);
    return () => clearInterval(interval);
  }, []);

  const maxAbs = sectors.length > 0 ? Math.max(...sectors.map(s => Math.abs(s.change_pct))) : 5;
  const displayed = showAll ? sectors : sectors.slice(0, 5);

  const gainers = sectors.filter(s => s.change_pct > 0).length;
  const losers = sectors.filter(s => s.change_pct < 0).length;

  return (
    <div className="border-b border-white/10" data-testid="sector-trending">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white">
            Sectors Today
          </span>
          <button
            onClick={fetchSectors}
            disabled={loading}
            className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            data-testid="refresh-sectors"
          >
            <ArrowsClockwise size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-600">Highest price movers</span>
          {sectors.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[8px] px-1 py-0.5 rounded bg-[#00E676]/15 text-[#00E676] font-bold">{gainers}+</span>
              <span className="text-[8px] px-1 py-0.5 rounded bg-[#FF3B30]/15 text-[#FF3B30] font-bold">{losers}-</span>
              {lastUpdated && <span className="text-[7px] text-zinc-700 font-mono">{lastUpdated}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Sector List */}
      {loading && sectors.length === 0 ? (
        <div className="px-3 pb-3 space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2.5 px-0 py-2 animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-white/8" />
              <div className="flex-1 h-3 bg-white/8 rounded" />
              <div className="w-24 h-2 bg-white/8 rounded-full" />
              <div className="w-12 h-3 bg-white/8 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-1 pb-1">
          {displayed.map(sector => (
            <SectorRow
              key={sector.ticker}
              sector={sector}
              maxAbs={maxAbs}
              onSelect={onSectorSelect}
            />
          ))}

          {/* See all / Collapse */}
          {sectors.length > 5 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold transition-colors border-t border-white/5 mt-1"
              data-testid="toggle-all-sectors"
            >
              {showAll ? 'Show less' : `See all ${sectors.length} sectors`}
              <CaretRight
                size={10}
                className={`transition-transform duration-200 ${showAll ? 'rotate-90' : ''}`}
              />
            </button>
          )}

          {sectors.length === 0 && !loading && (
            <p className="text-center text-[10px] text-zinc-600 py-4">Market closed ya data unavailable</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SectorTrending;
