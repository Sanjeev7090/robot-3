import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, MagnifyingGlass, TrendUp, TrendDown, ArrowsClockwise, CaretUpDown } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SECTOR_META = {
  bank:    { emoji: '🏦', color: '#60A5FA', label: 'NIFTY BANK' },
  it:      { emoji: '💻', color: '#A78BFA', label: 'NIFTY IT' },
  auto:    { emoji: '🚗', color: '#FBBF24', label: 'NIFTY AUTO' },
  pharma:  { emoji: '💊', color: '#34D399', label: 'NIFTY PHARMA' },
  fmcg:    { emoji: '🛒', color: '#F97316', label: 'NIFTY FMCG' },
  metal:   { emoji: '⚙️', color: '#9CA3AF', label: 'NIFTY METAL' },
  realty:  { emoji: '🏠', color: '#F472B6', label: 'NIFTY REALTY' },
  energy:  { emoji: '⚡', color: '#FCD34D', label: 'NIFTY ENERGY' },
  infra:   { emoji: '🏗️', color: '#6EE7B7', label: 'NIFTY INFRA' },
  media:   { emoji: '📺', color: '#C084FC', label: 'NIFTY MEDIA' },
  psubank: { emoji: '🏛️', color: '#93C5FD', label: 'NIFTY PSU BANK' },
  midcap:  { emoji: '📈', color: '#4ADE80', label: 'NIFTY MIDCAP' },
};

const StockRow = ({ stock, onSelect }) => {
  const isPositive = (stock.change_pct ?? 0) >= 0;
  const color = isPositive ? '#00E676' : '#FF3B30';
  const sign = isPositive ? '+' : '';
  const symbol = stock.ticker.replace('.NS', '').replace('.BO', '');
  const vol = stock.volume > 0
    ? stock.volume >= 10000000 ? `${(stock.volume / 10000000).toFixed(1)}Cr`
    : stock.volume >= 100000 ? `${(stock.volume / 100000).toFixed(1)}L`
    : `${(stock.volume / 1000).toFixed(0)}K`
    : '—';

  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/8 transition-colors border-b border-white/[0.04] last:border-0"
      onClick={() => onSelect(stock)}
      data-testid={`stock-row-${symbol}`}
    >
      {/* Symbol Badge */}
      <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 border border-white/8">
        <span className="text-[9px] font-black text-zinc-300 leading-tight text-center">{symbol.slice(0, 6)}</span>
      </div>

      {/* Name + Volume */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[12px] font-bold text-white truncate">{stock.name}</p>
        <p className="text-[9px] text-zinc-600 font-mono mt-0.5">Vol: {vol}</p>
      </div>

      {/* Price + Change */}
      <div className="text-right shrink-0">
        <p className="text-[13px] font-black font-mono text-white">
          {stock.price != null ? `₹${stock.price.toLocaleString('en-IN')}` : '—'}
        </p>
        <p className="text-[11px] font-bold font-mono flex items-center justify-end gap-0.5" style={{ color }}>
          {isPositive ? <TrendUp size={9} weight="bold" /> : <TrendDown size={9} weight="bold" />}
          {sign}{(stock.change_pct ?? 0).toFixed(2)}%
        </p>
      </div>
    </button>
  );
};

const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] animate-pulse">
    <div className="w-10 h-10 rounded-xl bg-white/8 shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-white/8 rounded w-3/4" />
      <div className="h-2 bg-white/8 rounded w-1/3" />
    </div>
    <div className="text-right space-y-1.5">
      <div className="h-3 bg-white/8 rounded w-16" />
      <div className="h-2.5 bg-white/8 rounded w-12" />
    </div>
  </div>
);

const SectorStocksSheet = ({ sector, onClose, onStockSelect }) => {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('change'); // change | price | name
  const [sortDir, setSortDir] = useState(-1); // -1 desc, 1 asc
  const [cached, setCached] = useState(false);

  const meta = SECTOR_META[sector?.icon] || { emoji: '📊', color: '#9CA3AF', label: sector?.name || 'Sector' };

  const fetchStocks = async () => {
    if (!sector?.icon) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/sectors/${sector.icon}/stocks`);
      setStocks(data.stocks || []);
      setCached(data.cached);
    } catch (e) {
      console.error('Sector stocks error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sector) {
      setStocks([]);
      setSearch('');
      fetchStocks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

  const toggleSort = (key) => {
    if (sort === key) setSortDir(d => d * -1);
    else { setSort(key); setSortDir(-1); }
  };

  const filtered = stocks
    .filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.ticker.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === 'change') return sortDir * ((b.change_pct ?? 0) - (a.change_pct ?? 0));
      if (sort === 'price')  return sortDir * ((b.price ?? 0) - (a.price ?? 0));
      if (sort === 'name')   return sortDir * a.name.localeCompare(b.name);
      return 0;
    });

  const gainers = stocks.filter(s => (s.change_pct ?? 0) > 0).length;
  const losers  = stocks.filter(s => (s.change_pct ?? 0) < 0).length;

  const handleStockClick = (stock) => {
    onStockSelect({ ticker: stock.ticker, name: stock.name, type: 'stock' });
    onClose();
  };

  if (!sector) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      data-testid="sector-stocks-sheet"
    >
      <div
        className="w-full sm:max-w-lg bg-[#0C0C0C] border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
              >
                {meta.emoji}
              </div>
              <div>
                <h2 className="text-[14px] font-black text-white">{meta.label}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#00E676]/15 text-[#00E676] font-bold">{gainers} gainers</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#FF3B30]/15 text-[#FF3B30] font-bold">{losers} losers</span>
                  {cached && <span className="text-[8px] text-zinc-700 font-mono">cached</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchStocks} className="p-1.5 text-zinc-500 hover:text-white transition-colors" data-testid="refresh-sector-stocks">
                <ArrowsClockwise size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white transition-colors" data-testid="close-sector-stocks">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stocks..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-700 outline-none focus:border-white/20"
              data-testid="sector-stocks-search"
            />
          </div>
        </div>

        {/* Sort Bar */}
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-white/5 shrink-0">
          <span className="text-[9px] text-zinc-600 mr-1.5 uppercase tracking-wider">Sort:</span>
          {[
            { key: 'change', label: '% Change' },
            { key: 'price',  label: 'Price' },
            { key: 'name',   label: 'Name' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => toggleSort(s.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold transition-all ${
                sort === s.key ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              data-testid={`sort-${s.key}`}
            >
              {s.label}
              {sort === s.key && <CaretUpDown size={8} />}
            </button>
          ))}
          <span className="ml-auto text-[9px] text-zinc-700">{filtered.length} stocks</span>
        </div>

        {/* Stocks List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <p className="text-center text-[11px] text-zinc-600 py-10">No stocks found</p>
          ) : (
            filtered.map(stock => (
              <StockRow
                key={stock.ticker}
                stock={stock}
                onSelect={handleStockClick}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/8 shrink-0">
          <p className="text-[9px] text-zinc-700 text-center">Click any stock to open chart • Live NSE data</p>
        </div>
      </div>
    </div>
  );
};

export default SectorStocksSheet;
