/**
 * Hybrid VWAP + TWAP Execution Strategy
 * - Displays VWAP, TWAP, bands, signal, RSI, volume ratio
 * - Shows TWAP execution plan (slice schedule)
 */
import React, { useState } from 'react';
import axios from 'axios';
import { ChartLine, ArrowFatUp, ArrowFatDown, Minus, Lightning, Timer, Rows } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── small helpers ────────────────────────────────────────────────────────────
const Row = ({ label, value, valueClass = 'text-zinc-300' }) => (
  <div className="flex items-center justify-between py-[3px]">
    <span className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</span>
    <span className={`text-[10px] font-mono font-bold ${valueClass}`}>{value}</span>
  </div>
);

const SignalPill = ({ sig }) => {
  if (!sig || sig === 'WAIT')
    return <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-zinc-700 text-zinc-400">WAIT</span>;
  const isBuy = sig === 'BUY';
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-black rounded ${
      isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
    }`}>
      {isBuy ? <ArrowFatUp size={9} weight="fill" /> : <ArrowFatDown size={9} weight="fill" />}
      {sig}
    </span>
  );
};

const PriceLine = ({ label, price, color }) => (
  <div className={`flex items-center justify-between px-2 py-1 rounded text-[9px] font-mono ${color}`}>
    <span>{label}</span>
    <span className="font-bold">₹{price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
  </div>
);

const ConfBar = ({ value, max = 100 }) => {
  const pct = Math.min(Math.max(value, 0), max);
  const col = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-yellow-500' : 'bg-zinc-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${col} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-zinc-400 w-6 text-right">{pct}</span>
    </div>
  );
};

// ── Execution plan mini-table ────────────────────────────────────────────────
const ExecPlan = ({ plan, side }) => {
  const [expanded, setExpanded] = useState(false);
  if (!plan?.length) return null;
  const shown = expanded ? plan : plan.slice(0, 4);
  const isBuy = side === 'BUY';

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-1 text-[8px] text-zinc-500 hover:text-zinc-300 transition-colors mb-1"
        data-testid="vwap-exec-plan-toggle"
      >
        <Rows size={9} />
        TWAP Execution Plan ({plan.length} slices)
        <span className="ml-1">{expanded ? '▲' : '▼'}</span>
      </button>
      <div className="rounded border border-white/5 overflow-hidden">
        <table className="w-full text-[8px]">
          <thead>
            <tr className="bg-zinc-900 border-b border-white/5">
              <th className="py-1 px-2 text-left text-zinc-600 font-bold uppercase">#</th>
              <th className="py-1 px-2 text-left text-zinc-600 font-bold uppercase">Time</th>
              <th className="py-1 px-2 text-right text-zinc-600 font-bold uppercase">Qty</th>
              <th className="py-1 px-2 text-right text-zinc-600 font-bold uppercase">Target ₹</th>
              <th className="py-1 px-2 text-right text-zinc-600 font-bold uppercase">VWAP Basis</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(s => (
              <tr key={s.slice_no} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="py-1 px-2 font-mono text-zinc-500">{s.slice_no}</td>
                <td className="py-1 px-2 font-mono text-zinc-400">+{s.time_offset_min}m</td>
                <td className={`py-1 px-2 font-mono text-right font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>{s.qty}</td>
                <td className="py-1 px-2 font-mono text-right text-zinc-300">₹{s.target_price.toFixed(2)}</td>
                <td className="py-1 px-2 font-mono text-right text-zinc-500">₹{s.vwap_basis.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!expanded && plan.length > 4 && (
          <div className="text-center py-1 text-[7px] text-zinc-600 bg-zinc-900/50">
            +{plan.length - 4} more slices
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const HybridVWAPAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [enabled,  setEnabled]  = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [qty,      setQty]      = useState(100);

  const analyze = async () => {
    if (!stockData?.bars || !selectedStock) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/hybrid-vwap/analyze`, {
        ticker:           selectedStock.ticker,
        bars:             stockData.bars,
        quantity:         qty,
        side:             'BUY',
        duration_minutes: 30,
        max_slices:       12,
      });
      setAnalysis(res.data);
      if (onAnalysisComplete) onAnalysisComplete('hybrid_vwap', res.data);
      toast.success('Hybrid VWAP+TWAP analysis complete!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'VWAP analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (next && stockData) analyze();
    else {
      setAnalysis(null);
      if (onAnalysisComplete) onAnalysisComplete(null, null);
    }
  };

  const d = analysis;

  // Price position badge
  const ppBadge = d?.price_position === 'ABOVE_VWAP'
    ? <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">Above VWAP</span>
    : d?.price_position === 'BELOW_VWAP'
    ? <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Below VWAP</span>
    : d?.price_position === 'AT_VWAP'
    ? <span className="text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">At VWAP</span>
    : null;

  return (
    <div className="p-3" data-testid="hybrid-vwap-analysis">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ChartLine size={14} className="text-sky-400" weight="bold" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
              Hybrid VWAP+TWAP
            </span>
            {d && (
              <span className={`ml-2 text-[7px] font-bold uppercase ${
                d.vwap_signal_type === 'BOUNCE' ? 'text-yellow-400' : 'text-sky-400'
              }`}>
                {d.vwap_signal_type}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-[#00E676]' : 'bg-zinc-700'}`}
          data-testid="vwap-toggle"
        >
          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
            enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {enabled && loading && (
        <div className="flex items-center gap-2 py-2">
          <ChartLine size={10} className="text-sky-400 animate-pulse" />
          <p className="text-[10px] text-zinc-500 font-mono animate-pulse">
            Calculating VWAP / TWAP bands…
          </p>
        </div>
      )}

      {enabled && d && !loading && (
        <div className="animate-fade-in space-y-2">
          {/* Signal + confidence */}
          <div className="flex items-center gap-2">
            <SignalPill sig={d.signal_type} />
            {ppBadge}
            <span className="text-[8px] text-zinc-600 ml-auto">
              Dev: <span className={`font-bold ${d.vwap_deviation_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {d.vwap_deviation_pct > 0 ? '+' : ''}{d.vwap_deviation_pct?.toFixed(2)}%
              </span>
            </span>
          </div>

          <ConfBar value={d.confidence} />

          {/* VWAP / TWAP levels */}
          <div className="rounded bg-zinc-900/50 border border-white/5 overflow-hidden divide-y divide-white/5">
            <PriceLine label="Upper Band (+1.5σ)" price={d.upper_band} color="text-emerald-500/70 bg-emerald-500/5" />
            <PriceLine label="VWAP"               price={d.vwap}       color="text-yellow-400 bg-yellow-500/5" />
            <PriceLine label="TWAP"               price={d.twap}       color="text-sky-400/70 bg-sky-500/5" />
            <PriceLine label="Lower Band (-1.5σ)" price={d.lower_band} color="text-red-500/70 bg-red-500/5" />
          </div>

          {/* Key stats */}
          <div className="space-y-0.5 bg-zinc-900/30 rounded p-2">
            <Row label="RSI"         value={d.rsi?.toFixed(1)}
              valueClass={d.rsi > 65 ? 'text-orange-400' : d.rsi < 35 ? 'text-sky-400' : 'text-zinc-300'} />
            <Row label="Volume Ratio" value={`${d.volume_ratio}x`}
              valueClass={d.volume_ratio >= 1.5 ? 'text-emerald-400' : 'text-zinc-400'} />
            <Row label="ATR"          value={`₹${d.atr?.toFixed(2)}`} />
          </div>

          {/* Trade levels */}
          {d.signal_type !== 'WAIT' && (
            <div className="space-y-0.5">
              <p className="text-[8px] text-zinc-600 uppercase tracking-wider mb-1">Trade Levels</p>
              {d.entry_price  && <Row label="Entry"    value={`₹${d.entry_price}`}   valueClass="text-white" />}
              {d.stop_loss    && <Row label="Stop Loss" value={`₹${d.stop_loss}`}    valueClass="text-red-400" />}
              {d.target1      && <Row label="Target 1"  value={`₹${d.target1}`}      valueClass="text-emerald-400" />}
              {d.target2      && <Row label="Target 2"  value={`₹${d.target2}`}      valueClass="text-emerald-300" />}
              {d.target3      && <Row label="Target 3"  value={`₹${d.target3}`}      valueClass="text-emerald-200" />}
              {d.risk_reward  && <Row label="R:R"       value={d.risk_reward}         valueClass="text-sky-400" />}
            </div>
          )}

          {/* TWAP Execution Plan */}
          {d.signal_type !== 'WAIT' && (
            <div>
              <div className="flex items-center gap-2 mb-1 mt-2">
                <Timer size={10} className="text-sky-400" />
                <span className="text-[8px] text-zinc-500 uppercase tracking-wider">TWAP Execution</span>
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-[7px] text-zinc-600">Qty:</span>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    onBlur={analyze}
                    className="w-14 text-[8px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 outline-none"
                    data-testid="vwap-qty-input"
                  />
                </div>
              </div>
              <ExecPlan plan={d.execution_plan} side={d.signal_type} />
            </div>
          )}

          {/* Recommendation */}
          <div className="mt-2 p-2 bg-zinc-900/40 rounded border border-white/5">
            <p className="text-[8px] text-zinc-500 leading-relaxed">{d.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HybridVWAPAnalysis;
