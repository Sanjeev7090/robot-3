import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { ArrowClockwise, DownloadSimple, Warning } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/pece`;

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];

/* ─── OI bar cell ─────────────────────────────────────────────── */
function OIBar({ value }) {
  const max = 200_000; // 2L = wide bar
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const positive = value >= 0;
  return (
    <div className="flex items-center justify-center">
      <div
        className={`h-2.5 rounded-sm transition-all ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={{ width: `${Math.max(4, pct)}%`, minWidth: 4, maxWidth: 80 }}
      />
    </div>
  );
}

/* ─── PCR Badge ─────────────────────────────────────────────── */
function PCRBadge({ pcr }) {
  const color = pcr > 1.2 ? 'text-emerald-400' : pcr < 0.8 ? 'text-rose-400' : 'text-amber-400';
  return <span className={`font-mono text-xs font-bold ${color}`}>{pcr?.toFixed?.(2) ?? pcr}</span>;
}

/* ─── Change cell ─────────────────────────────────────────────── */
function ChangeCell({ val, fmt }) {
  if (!fmt || fmt === '0') return <span className="text-zinc-500 text-[11px]">0</span>;
  const pos = (val ?? 0) >= 0;
  return (
    <span className={`text-[11px] font-mono font-medium ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
      {fmt}
    </span>
  );
}

/* ─── PECE diff cell ─────────────────────────────────────────── */
function PECECell({ val, fmt }) {
  const positive = (val ?? 0) >= 0;
  return (
    <td className={`px-2 py-2 text-center font-mono text-xs font-bold rounded transition-colors ${
      positive
        ? 'bg-emerald-500/20 text-emerald-300'
        : 'bg-rose-500/20 text-rose-300'
    }`}>
      {fmt || '0'}
    </td>
  );
}

/* ─── Custom Tooltip ─────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs">
      <p className="text-zinc-400">{label}</p>
      <p className={`font-bold ${v >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        PE-CE: {v >= 0 ? '+' : ''}{(v / 100000).toFixed(1)}L
      </p>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function PECETracker() {
  const [symbol, setSymbol]       = useState('NIFTY');
  const [rows, setRows]           = useState([]);
  const [latest, setLatest]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(false);
  const [error, setError]         = useState(null);
  const [source, setSource]       = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [timeframe, setTimeframe] = useState(1); // 1 / 5 / 15 min
  const autoRef = useRef(null);

  const loadHistory = useCallback(async (sym = symbol) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/history/${sym}?limit=60&demo=true`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRows(d.data || []);
      setSource(d.source || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const loadLatest = useCallback(async (sym = symbol) => {
    try {
      const r = await fetch(`${API}/latest/${sym}?demo=true`);
      if (!r.ok) return;
      const d = await r.json();
      setLatest(d);
    } catch {}
  }, [symbol]);

  const fetchLive = useCallback(async () => {
    setFetching(true);
    try {
      const r = await fetch(`${API}/snapshot/${symbol}`, { method: 'POST' });
      const d = await r.json();
      if (d.status === 'live') {
        await Promise.all([loadHistory(symbol), loadLatest(symbol)]);
        setLastRefresh(new Date());
      } else {
        await Promise.all([loadHistory(symbol), loadLatest(symbol)]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }, [symbol, loadHistory, loadLatest]);

  // Initial load
  useEffect(() => {
    loadHistory(symbol);
    loadLatest(symbol);
    fetchLive();
    // Auto-refresh every 60s
    autoRef.current = setInterval(() => fetchLive(), 60_000);
    return () => clearInterval(autoRef.current);
  }, [symbol]); // eslint-disable-line

  // Aggregate rows by timeframe
  const aggregated = React.useMemo(() => {
    if (timeframe === 1 || !rows.length) return rows;
    const grouped = [];
    for (let i = 0; i < rows.length; i += timeframe) {
      const slice = rows.slice(i, i + timeframe);
      if (!slice.length) continue;
      const last = slice[0]; // latest is first (rows are reversed)
      grouped.push({
        ...last,
        put_oi_chg:  slice.reduce((s, r) => s + r.put_oi_chg, 0),
        call_oi_chg: slice.reduce((s, r) => s + r.call_oi_chg, 0),
        pece_chg:    slice.reduce((s, r) => s + r.pece_chg, 0),
        put_oi_chg_fmt:  last.put_oi_chg_fmt,
        call_oi_chg_fmt: last.call_oi_chg_fmt,
        pece_chg_fmt:    last.pece_chg_fmt,
      });
    }
    return grouped;
  }, [rows, timeframe]);

  // Chart data (oldest first)
  const chartData = React.useMemo(() => {
    return [...aggregated].reverse().map(r => ({
      time: r.time_str,
      pece: r.pece_diff,
    }));
  }, [aggregated]);

  const exportCSV = () => {
    const header = 'Time,Put OI,Put Change,Call OI,Call Change,PE-CE Diff,PE-CE Change,PCR';
    const csvRows = aggregated.map(r =>
      `${r.time_str},${r.put_oi_fmt},${r.put_oi_chg_fmt},${r.call_oi_fmt},${r.call_oi_chg_fmt},${r.pece_diff_fmt},${r.pece_chg_fmt},${r.pcr}`
    );
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pece_oi_${symbol}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const bias      = latest?.bias || 'NEUTRAL';
  const biasColor = latest?.bias_color || '#FFD93D';
  const pcrTrend  = latest?.pcr_trend || 'Neutral';
  const isDemo    = source === 'demo';

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]" data-testid="pece-tracker">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-white/10 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black tracking-tight text-zinc-100">PE-CE OI Tracker</h2>
            {isDemo && (
              <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold uppercase tracking-wider">
                <Warning size={9} weight="fill" /> DEMO
              </span>
            )}
            {!isDemo && source === 'mongodb' && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold uppercase">LIVE</span>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            1-min OI Diff · {symbol} · {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Fetching...'}
          </p>
        </div>

        {/* Symbol selector */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
          {SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${
                symbol === s ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              data-testid={`pece-sym-${s.toLowerCase()}`}
            >{s}</button>
          ))}
        </div>

        {/* Timeframe selector */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
          {[1, 5, 15].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                timeframe === tf ? 'bg-sky-500/20 text-sky-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              data-testid={`pece-tf-${tf}`}
            >{tf}m</button>
          ))}
        </div>

        <button
          onClick={fetchLive}
          disabled={fetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-zinc-100 hover:border-white/25 hover:bg-white/5 transition-all disabled:opacity-40 shrink-0"
          data-testid="pece-refresh-btn"
        >
          <ArrowClockwise size={12} className={fetching ? 'animate-spin' : ''} />
          {fetching ? 'Fetching...' : 'Refresh'}
        </button>

        <button
          onClick={exportCSV}
          disabled={!rows.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-zinc-100 hover:border-white/25 hover:bg-white/5 transition-all disabled:opacity-40 shrink-0"
          data-testid="pece-export-btn"
        >
          <DownloadSimple size={12} />
          CSV
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 p-2 text-xs text-rose-400 border border-rose-500/30 bg-rose-500/10 rounded-lg">{error}</div>
      )}

      {/* Content: Table + Chart */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden min-h-0">

        {/* LEFT — Live Table */}
        <div className="flex-1 overflow-auto min-h-0" data-testid="pece-table">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-xs border-collapse min-w-[520px]">
              <thead className="sticky top-0 z-10 bg-[#111] border-b border-white/10">
                <tr>
                  <th className="px-2 py-2 text-left text-zinc-500 font-bold uppercase tracking-wider w-14">Time</th>
                  {/* Put OI */}
                  <th className="px-2 py-2 text-center text-rose-400/80 font-bold uppercase tracking-wider" colSpan={2}>
                    Put OI
                  </th>
                  {/* Call OI */}
                  <th className="px-2 py-2 text-center text-sky-400/80 font-bold uppercase tracking-wider" colSpan={2}>
                    Call OI
                  </th>
                  {/* PE-CE */}
                  <th className="px-2 py-2 text-center text-emerald-400/80 font-bold uppercase tracking-wider" colSpan={2}>
                    PE−CE OI
                  </th>
                  {/* Bar */}
                  <th className="px-2 py-2 text-center text-zinc-500 font-bold uppercase tracking-wider w-20">Bar</th>
                  {/* PCR */}
                  <th className="px-2 py-2 text-center text-amber-400/80 font-bold uppercase tracking-wider w-12">PCR</th>
                </tr>
                <tr className="border-b border-white/5">
                  <th className="px-2 py-1 text-[9px] text-zinc-600"></th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Total</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Change</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Total</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Change</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Value</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Change</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center">Day</th>
                  <th className="px-2 py-1 text-[9px] text-zinc-500 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((row, idx) => {
                  const positive = row.pece_diff >= 0;
                  const rowBg = idx === 0 ? 'bg-zinc-800/40' : idx % 2 === 0 ? 'bg-black/20' : '';
                  return (
                    <tr key={row.ts + idx} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${rowBg}`}
                        data-testid={`pece-row-${row.time_str}`}>
                      <td className="px-2 py-1.5 text-zinc-300 font-mono text-xs whitespace-nowrap">{row.time_str}</td>
                      {/* Put OI */}
                      <td className="px-2 py-1.5 text-center text-zinc-400 font-mono">{row.put_oi_fmt}</td>
                      <td className="px-2 py-1.5 text-center"><ChangeCell val={row.put_oi_chg} fmt={row.put_oi_chg_fmt} /></td>
                      {/* Call OI */}
                      <td className="px-2 py-1.5 text-center text-zinc-400 font-mono">{row.call_oi_fmt}</td>
                      <td className="px-2 py-1.5 text-center"><ChangeCell val={row.call_oi_chg} fmt={row.call_oi_chg_fmt} /></td>
                      {/* PE-CE */}
                      <PECECell val={row.pece_diff} fmt={row.pece_diff_fmt} />
                      <td className="px-2 py-1.5 text-center"><ChangeCell val={row.pece_chg} fmt={row.pece_chg_fmt} /></td>
                      {/* Bar */}
                      <td className="px-2 py-1.5"><OIBar value={row.pece_diff} /></td>
                      {/* PCR */}
                      <td className="px-2 py-1.5 text-center"><PCRBadge pcr={row.pcr} /></td>
                    </tr>
                  );
                })}
                {aggregated.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-600">
                    No data — click Refresh to fetch latest
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* RIGHT — Chart + Summary */}
        <div className="xl:w-64 shrink-0 border-t xl:border-t-0 xl:border-l border-white/10 flex flex-col" data-testid="pece-summary">
          {/* Bias summary */}
          <div className="p-4 border-b border-white/10">
            <p className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider font-bold">Market Bias</p>
            <div
              className="text-xl font-black py-2 px-3 rounded-lg border text-center"
              style={{ color: biasColor, borderColor: biasColor + '40', background: biasColor + '15' }}
              data-testid="pece-bias"
            >
              {bias}
            </div>
            {latest?.snapshot && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">PCR</span>
                  <span className="font-mono font-bold" style={{ color: biasColor }}>
                    {latest.snapshot.pcr?.toFixed?.(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">PCR Trend</span>
                  <span className={`font-bold text-[10px] ${pcrTrend === 'Rising' ? 'text-emerald-400' : pcrTrend === 'Falling' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {pcrTrend}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">PE-CE Diff</span>
                  <span className={`font-mono font-bold ${(latest.snapshot.pece_diff || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {latest.snapshot.pece_diff_fmt}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Spot</span>
                  <span className="font-mono text-zinc-300">
                    {latest.snapshot.underlying ? `₹${latest.snapshot.underlying.toLocaleString('en-IN')}` : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* PE-CE Chart */}
          <div className="flex-1 p-2 min-h-0">
            <p className="text-[10px] text-zinc-500 mb-2 px-1 uppercase tracking-wider font-bold">PE−CE OI Chart</p>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 8, fill: '#555' }}
                    interval={Math.floor(chartData.length / 6)}
                  />
                  <YAxis tick={{ fontSize: 8, fill: '#555' }} tickFormatter={v => `${(v/100000).toFixed(0)}L`} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="pece"
                    stroke="#00E676"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
                Chart populates with more data
              </div>
            )}
          </div>

          {/* Zones legend */}
          <div className="px-3 pb-3 space-y-1">
            <div className="flex items-center gap-2 text-[10px]">
              <div className="w-6 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-zinc-500">Bullish (PE &gt; CE writing)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="w-6 h-1.5 bg-rose-500 rounded-full" />
              <span className="text-zinc-500">Bearish (CE &gt; PE writing)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
