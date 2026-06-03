import React, { useState, useRef, useEffect } from 'react';
import { X, MagnifyingGlass, TrendUp, TrendDown, Lightning, SortAscending, SortDescending, DownloadSimple, WhatsappLogo, TelegramLogo, BroadcastIcon } from '@phosphor-icons/react';
import TelegramChannelsPanel from './TelegramChannelsPanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CAP_COLORS = { large: '#60A5FA', mid: '#FBBF24', small: '#4ADE80' };
const DIR_COLOR  = { BUY: '#00E676', SELL: '#FF3B30' };

// ---- Export helpers ----
const _todayStr = () => new Date().toISOString().slice(0, 10);

const _csvEscape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildCsv = (rows) => {
  const headers = ['Ticker', 'Name', 'Cap', 'Signal', 'Price', 'Entry', 'StopLoss', 'Target', 'Confidence', 'Strategies'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    lines.push([
      r.ticker, r.name, r.cap, r.best_direction,
      r.current_price, r.best_entry, r.best_sl, r.best_target,
      `${r.best_confidence}%`, (r.strategies || []).join(' | '),
    ].map(_csvEscape).join(','));
  });
  return lines.join('\n');
};

const downloadCsv = (rows) => {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-finder-${_todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const buildShareText = (rows, { bmpOnly = false } = {}) => {
  const top = rows.slice(0, 15);
  // BMP-only chars for WhatsApp (wa.me redirect breaks surrogate-pair emojis)
  const hdr  = bmpOnly ? '\u25C6' : '\uD83D\uDCCA';                       // ◆ vs 📊
  const buy  = bmpOnly ? '\u25B2' : '\uD83D\uDFE2';                       // ▲ vs 🟢
  const sell = bmpOnly ? '\u25BC' : '\uD83D\uDD34';                       // ▼ vs 🔴
  const head = `${hdr} *Gann Trader \u2014 Stock Finder*\n${_todayStr()} \u00B7 ${rows.length} setups\n`;
  const lines = top.map((r, i) => {
    const dir = r.best_direction === 'BUY' ? buy : sell;
    const sym = r.ticker.replace('.NS', '').replace('.BO', '');
    return `${i + 1}. ${dir} ${sym} (${r.best_direction})\n   Entry \u20B9${r.best_entry} \u00B7 SL \u20B9${r.best_sl} \u00B7 TGT \u20B9${r.best_target} \u00B7 ${r.best_confidence}%`;
  });
  const footer = rows.length > top.length ? `\n\u2026+${rows.length - top.length} more` : '';
  return `${head}\n${lines.join('\n')}${footer}`;
};

const whatsappUrl = (rows) => {
  const text = encodeURIComponent(buildShareText(rows, { bmpOnly: true }));
  return `https://wa.me/?text=${text}`;
};

const telegramUrl = (rows) => {
  const text = encodeURIComponent(buildShareText(rows));
  return `https://t.me/share/url?url=https://emergent.sh&text=${text}`;
};

// Animated progress bar
const ProgressBar = ({ current, total, symbol }) => {
  const pct = total > 0 ? Math.round(current / total * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-zinc-400">
          Scanning <span className="text-white font-bold">{symbol?.replace('.NS','').replace('.BO','')}</span>…
        </span>
        <span className="text-zinc-500">{current}/{total} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#00E676] to-[#00BCD4] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// Result row in the table
const ResultRow = ({ result, onSelect }) => {
  const dirColor = DIR_COLOR[result.best_direction] || '#fff';
  const capColor = CAP_COLORS[result.cap] || '#9CA3AF';
  const sym      = result.ticker.replace('.NS','').replace('.BO','');

  return (
    <tr
      className="border-b border-white/[0.05] hover:bg-white/[0.04] cursor-pointer transition-colors group"
      onClick={() => onSelect(result)}
      data-testid={`finder-row-${sym}`}
    >
      {/* Stock */}
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0"
            style={{ backgroundColor: `${capColor}18`, border: `1px solid ${capColor}30`, color: capColor }}
          >
            {sym.slice(0,4)}
          </div>
          <div>
            <p className="text-[11px] font-bold text-white group-hover:text-[#00E676] transition-colors truncate max-w-[120px]">
              {result.name}
            </p>
            <p className="text-[9px] text-zinc-600 font-mono">{sym}</p>
          </div>
        </div>
      </td>

      {/* Direction */}
      <td className="py-2.5 px-2 text-center">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded"
          style={{ backgroundColor: `${dirColor}18`, color: dirColor }}
        >
          {result.best_direction === 'BUY'
            ? <TrendUp size={9} weight="bold" />
            : <TrendDown size={9} weight="bold" />}
          {result.best_direction}
        </span>
      </td>

      {/* Price */}
      <td className="py-2.5 px-2 text-right font-mono text-[11px] text-zinc-300">
        ₹{result.current_price?.toLocaleString('en-IN') ?? '—'}
      </td>

      {/* Entry */}
      <td className="py-2.5 px-2 text-right font-mono text-[11px] text-white font-bold">
        ₹{result.best_entry?.toLocaleString('en-IN') ?? '—'}
      </td>

      {/* SL */}
      <td className="py-2.5 px-2 text-right font-mono text-[10px] text-red-400">
        ₹{result.best_sl?.toLocaleString('en-IN') ?? '—'}
      </td>

      {/* Target */}
      <td className="py-2.5 px-2 text-right font-mono text-[10px] text-emerald-400">
        ₹{result.best_target?.toLocaleString('en-IN') ?? '—'}
      </td>

      {/* Strategies */}
      <td className="py-2.5 pl-2 pr-4">
        <div className="flex flex-wrap gap-1">
          {result.strategies?.slice(0, 2).map((s, i) => (
            <span key={i} className="text-[7px] px-1.5 py-0.5 rounded bg-white/8 text-zinc-400 font-semibold">
              {s.replace(' Strategy','').slice(0,12)}
            </span>
          ))}
          {result.strategies?.length > 2 && (
            <span className="text-[7px] px-1 py-0.5 rounded bg-white/8 text-zinc-600">
              +{result.strategies.length - 2}
            </span>
          )}
        </div>
      </td>

      {/* Confidence */}
      <td className="py-2.5 px-2 text-right">
        <span className="text-[10px] font-black font-mono" style={{ color: result.best_confidence >= 80 ? '#00E676' : '#FBBF24' }}>
          {result.best_confidence}%
        </span>
      </td>
    </tr>
  );
};

// ---- Main Modal ----
const StockFinderModal = ({ onClose, onStockSelect }) => {
  const [scanning,  setScanning]  = useState(false);
  const [done,      setDone]      = useState(false);
  const [progress,  setProgress]  = useState({ current: 0, total: 0, symbol: '' });
  const [results,   setResults]   = useState([]);
  const [filter,    setFilter]    = useState('ALL');    // ALL | BUY | SELL
  const [capFilter, setCapFilter] = useState('all');    // all | large | mid | small
  const [search,    setSearch]    = useState('');
  const [sortKey,   setSortKey]   = useState('name');
  const [sortDir,   setSortDir]   = useState(1);
  const sourceRef = useRef(null);

  const startScan = () => {
    if (sourceRef.current) { sourceRef.current.close(); }
    setResults([]);
    setDone(false);
    setProgress({ current: 0, total: 0, symbol: '' });
    setScanning(true);

    const url = `${API}/stock-finder/scan?cap=${capFilter}`;
    const es  = new EventSource(url);
    sourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'progress') {
          setProgress({ current: data.current, total: data.total, symbol: data.symbol });
        } else if (data.type === 'result') {
          setResults(prev => [...prev, data]);
        } else if (data.type === 'done') {
          setScanning(false);
          setDone(true);
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      setScanning(false);
      setDone(true);
      es.close();
    };
  };

  // Stop scan on unmount
  useEffect(() => () => sourceRef.current?.close(), []);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(key === 'name' ? 1 : -1); }
  };

  const filtered = results
    .filter(r => filter === 'ALL' || r.best_direction === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
                            r.ticker.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'confidence') return sortDir * (b.best_confidence - a.best_confidence);
      if (sortKey === 'signals')    return sortDir * (b.signal_count    - a.signal_count);
      if (sortKey === 'name')       return sortDir * a.name.localeCompare(b.name);
      return 0;
    });

  const buyCount  = results.filter(r => r.best_direction === 'BUY').length;
  const sellCount = results.filter(r => r.best_direction === 'SELL').length;

  const SortBtn = ({ label, k }) => (
    <button
      onClick={() => handleSort(k)}
      className={`flex items-center gap-0.5 text-[9px] font-bold transition-colors ${sortKey === k ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
    >
      {label}
      {sortKey === k && (sortDir < 0 ? <SortDescending size={9} /> : <SortAscending size={9} />)}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-[#0A0A0A] border border-white/10 rounded-2xl flex flex-col shadow-2xl"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
                <Lightning size={16} className="text-yellow-400" weight="fill" />
              </div>
              <div>
                <h2 className="text-[14px] font-black text-white">Stock Finder</h2>
                <p className="text-[9px] text-zinc-600">
                  {done
                    ? `${results.length} signals found in ${progress.total} stocks`
                    : 'Scan karo — sabhi stocks pe strategies run hongi'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors" data-testid="close-finder">
              <X size={18} />
            </button>
          </div>

          {/* Controls Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Cap filter */}
            <div className="flex items-center bg-white/[0.05] rounded-full p-0.5 gap-0.5">
              {[['all','All'], ['large','Large'], ['mid','Mid'], ['small','Small']].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setCapFilter(k)}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all ${capFilter === k ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                  data-testid={`cap-filter-${k}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Start / Stop */}
            <button
              onClick={scanning ? () => { sourceRef.current?.close(); setScanning(false); setDone(true); } : startScan}
              className={`px-4 py-2 rounded-full text-[11px] font-black transition-all ${
                scanning
                  ? 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/30 hover:bg-[#FF3B30]/30'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
              }`}
              data-testid="start-stock-finder"
            >
              {scanning ? 'Stop Scan' : done ? 'Rescan' : 'Scan Karo'}
            </button>

            {/* Direction filter — shown after results */}
            {results.length > 0 && (
              <div className="flex items-center gap-1 ml-1">
                {[['ALL','All'],['BUY','BUY'],['SELL','SELL']].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all ${
                      filter === k
                        ? k === 'BUY' ? 'bg-[#00E676]/20 text-[#00E676]'
                        : k === 'SELL' ? 'bg-[#FF3B30]/20 text-[#FF3B30]'
                        : 'bg-white/10 text-white'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                    data-testid={`dir-filter-${k}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}

            {/* Stats */}
            {results.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[9px] px-2 py-0.5 rounded bg-[#00E676]/10 text-[#00E676] font-bold">{buyCount} BUY</span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-[#FF3B30]/10 text-[#FF3B30] font-bold">{sellCount} SELL</span>
              </div>
            )}
          </div>

          {/* Progress bar (while scanning) */}
          {scanning && progress.total > 0 && (
            <div className="mt-3">
              <ProgressBar {...progress} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* No data state */}
          {!scanning && !done && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                <Lightning size={32} className="text-yellow-400" weight="fill" />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-bold text-white mb-1">Sabhi Stocks Scan Karo</p>
                <p className="text-[10px] text-zinc-600 max-w-xs">
                  {`${_UNIVERSE_COUNT} NSE stocks pe sabhi strategies run hongi — sirf wahi results aayenge jahan actual signal ho`}
                </p>
              </div>
              <button
                onClick={startScan}
                className="px-6 py-2.5 rounded-full text-[12px] font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-all"
              >
                Start Scan
              </button>
            </div>
          )}

          {/* Live scanning state — show results as they come */}
          {(scanning || done) && (
            <>
              {/* Search + Sort */}
              {results.length > 0 && (
                <div className="px-4 py-2 flex items-center gap-3 border-b border-white/5 shrink-0">
                  <div className="relative flex-1 max-w-xs">
                    <MagnifyingGlass size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Filter results..."
                      className="w-full bg-white/5 border border-white/8 rounded-full pl-7 pr-3 py-1.5 text-[10px] text-white placeholder-zinc-700 outline-none"
                      data-testid="finder-search"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-zinc-600 ml-auto">
                    <span>Sort:</span>
                    <SortBtn label="Confidence" k="confidence" />
                    <SortBtn label="Signals"    k="signals" />
                    <SortBtn label="Name"       k="name" />
                    <span className="ml-1 text-zinc-700">{filtered.length} results</span>
                  </div>
                </div>
              )}

              {/* Results table */}
              {filtered.length > 0 ? (
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#0A0A0A] border-b border-white/8 z-10">
                      <tr className="text-[8px] uppercase tracking-wider text-zinc-600">
                        <th className="py-2 pl-4 pr-2">Stock</th>
                        <th className="py-2 px-2 text-center">Signal</th>
                        <th className="py-2 px-2 text-right">Price</th>
                        <th className="py-2 px-2 text-right">Entry</th>
                        <th className="py-2 px-2 text-right">SL</th>
                        <th className="py-2 px-2 text-right">Target</th>
                        <th className="py-2 pl-2 pr-4">Strategies</th>
                        <th className="py-2 px-2 text-right">Conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <ResultRow
                          key={r.ticker}
                          result={r}
                          onSelect={(res) => {
                            onStockSelect({ ticker: res.ticker, name: res.name, type: 'stock' });
                            onClose();
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : scanning ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="flex gap-1.5 justify-center mb-3">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-600">Scanning stocks… results yahan aayenge</p>
                  </div>
                </div>
              ) : done && results.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[11px] text-zinc-600">Koi signal nahi mila — market wait mode mein hai</p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/8 shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[9px] text-zinc-700">
            Click any row to open chart • Live NSE data • Mini strategies only
          </p>

          <div className="flex items-center gap-2">
            {done && results.length > 0 && (
              <span className="text-[9px] text-zinc-600 mr-1">
                {results.length}/{progress.total} stocks · {filtered.length} shown
              </span>
            )}

            {/* Export / Share buttons */}
            <button
              onClick={() => downloadCsv(filtered)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold bg-white/[0.05] text-zinc-300 hover:bg-white/10 hover:text-white border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="export-csv"
              title="Download as CSV"
            >
              <DownloadSimple size={11} weight="bold" />
              CSV
            </button>

            <a
              href={filtered.length > 0 ? whatsappUrl(filtered) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={filtered.length === 0}
              onClick={(e) => { if (filtered.length === 0) e.preventDefault(); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 border border-[#25D366]/25 transition-colors no-underline ${
                filtered.length === 0 ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
              data-testid="share-whatsapp"
              title="Share top setups on WhatsApp"
            >
              <WhatsappLogo size={11} weight="bold" />
              WhatsApp
            </a>

            <a
              href={filtered.length > 0 ? telegramUrl(filtered) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={filtered.length === 0}
              onClick={(e) => { if (filtered.length === 0) e.preventDefault(); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold bg-[#229ED9]/15 text-[#229ED9] hover:bg-[#229ED9]/25 border border-[#229ED9]/25 transition-colors no-underline ${
                filtered.length === 0 ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
              data-testid="share-telegram"
              title="Share top setups on Telegram"
            >
              <TelegramLogo size={11} weight="bold" />
              Telegram
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

// placeholder constant for display (overridden at runtime)
const _UNIVERSE_COUNT = 120;

export default StockFinderModal;
