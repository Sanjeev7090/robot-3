import React, { useState, useEffect } from 'react';
import { Brain, Sparkle, Target, ChartLineUp, Lightning, Robot, Check, X, ArrowsClockwise } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/ensemble`;

const SIGNAL_COLOR = {
  BUY:     'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  SELL:    'text-rose-400 border-rose-500/40 bg-rose-500/10',
  HOLD:    'text-amber-400 border-amber-500/40 bg-amber-500/10',
  ABSTAIN: 'text-slate-400 border-slate-500/40 bg-slate-500/10',
};

const MODEL_BADGE = {
  'Claude Sonnet 4.5': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'Gemini 3 Pro':      'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'GPT-5.2':           'bg-teal-500/15 text-teal-300 border-teal-500/30',
};

function ConfidenceBar({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
      <div className={`${color} h-full transition-all duration-700`} style={{ width: `${v}%` }} />
    </div>
  );
}

function ModelVoteCard({ vote }) {
  const sig = vote.signal || 'N/A';
  const sigColor = SIGNAL_COLOR[sig] || SIGNAL_COLOR.ABSTAIN;
  const badge = MODEL_BADGE[vote.model] || 'bg-zinc-800 text-zinc-300';
  return (
    <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/40 hover:bg-zinc-900/70 transition-all" data-testid={`vote-card-${vote.model}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-widest border ${badge}`}>{vote.model}</span>
        <span className="text-[10px] text-zinc-500">w={vote.weight?.toFixed(2)}</span>
      </div>
      {vote.ok ? (
        <>
          <div className={`inline-flex px-3 py-1 rounded-lg border text-xs font-bold tracking-wider ${sigColor}`}>{sig}</div>
          <div className="mt-3 mb-1 flex justify-between text-[11px]">
            <span className="text-zinc-500">Confidence</span>
            <span className="text-zinc-300 font-mono">{vote.confidence?.toFixed?.(1) ?? vote.confidence}%</span>
          </div>
          <ConfidenceBar value={vote.confidence} />
          {vote.rationale && (
            <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed line-clamp-3">{vote.rationale}</p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs text-rose-400">
          <X size={14} /> {vote.rationale || 'failed'}
        </div>
      )}
    </div>
  );
}

function ConsensusBlock({ verdict }) {
  if (!verdict) return null;
  const sig = verdict.consensus || 'ABSTAIN';
  const color = SIGNAL_COLOR[sig] || SIGNAL_COLOR.ABSTAIN;
  return (
    <div className="border border-zinc-800 rounded-2xl p-6 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" data-testid="ensemble-consensus">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
        <Sparkle size={14} weight="fill" /> Ensemble Consensus
      </div>
      <div className="flex items-end gap-4 mb-4">
        <div className={`inline-flex px-5 py-2.5 rounded-xl border text-2xl font-black tracking-wider ${color}`} data-testid="consensus-signal">
          {sig}
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>Confidence</span>
            <span className="font-mono text-zinc-200" data-testid="consensus-confidence">{verdict.confidence}%</span>
          </div>
          <ConfidenceBar value={verdict.confidence} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
        {['BUY', 'SELL', 'HOLD'].map(k => (
          <div key={k} className="border border-zinc-800 rounded-lg p-2 bg-black/40">
            <div className={`uppercase tracking-widest ${k === 'BUY' ? 'text-emerald-400' : k === 'SELL' ? 'text-rose-400' : 'text-amber-400'}`}>{k}</div>
            <div className="font-mono text-zinc-300 mt-1">{verdict.weighted_score?.[k]?.toFixed(2) ?? '0.00'}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] text-zinc-600">
        {verdict.valid_voters}/{verdict.total_voters} models responded · method: {verdict.method} · mode: {verdict.provider_mode}
      </div>
    </div>
  );
}

export default function EnsembleCockpitPanel({ selectedStock }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeTask, setActiveTask] = useState(null); // 'signal' | 'gann'
  const [signalResult, setSignalResult] = useState(null);
  const [gannResult, setGannResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/status`).then(r => r.json()).then(setStatus).catch(() => {});
  }, []);

  const ticker = selectedStock?.ticker || selectedStock?.id || 'RELIANCE.NS';

  const runSignal = async () => {
    setBusy(true);
    setActiveTask('signal');
    setError(null);
    try {
      const r = await fetch(`${API}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'failed');
      setSignalResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setActiveTask(null);
    }
  };

  const runGann = async () => {
    setBusy(true);
    setActiveTask('gann');
    setError(null);
    try {
      const r = await fetch(`${API}/gann-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'failed');
      setGannResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setActiveTask(null);
    }
  };

  return (
    <div className="p-4 space-y-5" data-testid="ensemble-cockpit">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-zinc-100 font-bold text-lg">
            <Brain size={22} weight="duotone" className="text-fuchsia-400" />
            AI Ensemble Cockpit
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            3-model weighted voting · Claude 4.5 + Gemini 3 Pro + GPT-5.2
          </p>
        </div>
        <div className="text-right text-[10px] text-zinc-500">
          Ticker: <span className="text-zinc-300 font-mono">{ticker}</span>
          {status && (
            <div className="mt-1">
              Mode: <span className="text-zinc-300">{status.provider_mode}</span>
              {status.key_configured ? (
                <Check size={11} className="inline ml-1 text-emerald-400" />
              ) : (
                <X size={11} className="inline ml-1 text-rose-400" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={runSignal}
          disabled={busy}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300 text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          data-testid="btn-ask-ensemble-signal"
        >
          {activeTask === 'signal'
            ? <><ArrowsClockwise size={14} className="animate-spin" /> Asking 3 models…</>
            : <><Robot size={16} weight="duotone" /> Ask Ensemble Signal</>}
        </button>
        <button
          onClick={runGann}
          disabled={busy}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          data-testid="btn-ai-gann-optimize"
        >
          {activeTask === 'gann'
            ? <><ArrowsClockwise size={14} className="animate-spin" /> Optimising Gann…</>
            : <><Target size={16} weight="duotone" /> AI Gann + SoQ Optimise</>}
        </button>
      </div>

      {error && (
        <div className="text-xs text-rose-400 border border-rose-500/30 bg-rose-500/10 rounded-lg p-3" data-testid="ensemble-error">
          ⚠ {error}
        </div>
      )}

      {/* Signal result */}
      {signalResult && (
        <div className="space-y-3" data-testid="signal-result">
          <ConsensusBlock verdict={signalResult.verdict} />
          {signalResult.context && (
            <div className="text-[11px] grid grid-cols-2 md:grid-cols-4 gap-2 bg-zinc-900/40 border border-zinc-800 rounded-xl p-3">
              {Object.entries(signalResult.context).map(([k, v]) => (
                <div key={k}>
                  <span className="text-zinc-500 uppercase tracking-widest">{k.replace(/_/g, ' ')}</span>
                  <div className="text-zinc-200 font-mono">{String(v)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {signalResult.verdict?.votes?.map((v, i) => <ModelVoteCard key={i} vote={v} />)}
          </div>
        </div>
      )}

      {/* Gann result */}
      {gannResult && (
        <div className="space-y-4 mt-4 pt-4 border-t border-zinc-800" data-testid="gann-result">
          <div className="flex items-center gap-2 text-cyan-300 text-xs uppercase tracking-[0.2em]">
            <Target size={14} weight="fill" /> AI Gann Pattern Recognition
            <span className="ml-auto text-[10px] text-zinc-500">SoQ ring: {gannResult.soq_ring}</span>
          </div>

          <ConsensusBlock verdict={gannResult.ensemble} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/40">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">AI-Chosen Pivot</div>
              <div className="text-sm text-zinc-200 font-mono">{gannResult.chosen_pivot?.type}</div>
              <div className="text-xs text-zinc-400 mt-1">
                ₹{gannResult.chosen_pivot?.price?.toFixed?.(2)} · age {gannResult.chosen_pivot?.age_bars} bars · strength {gannResult.chosen_pivot?.strength}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/40">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Active Gann Angles</div>
              <div className="flex flex-wrap gap-1.5">
                {gannResult.active_angles?.map(a => (
                  <span key={a} className="px-2 py-1 rounded-md text-[10px] font-mono bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">{a}</span>
                ))}
                {gannResult.all_angles?.filter(a => !gannResult.active_angles?.includes(a)).map(a => (
                  <span key={a} className="px-2 py-1 rounded-md text-[10px] font-mono bg-zinc-800/40 border border-zinc-800 text-zinc-600 line-through">{a}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Gann Fan levels */}
          <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800 flex items-center gap-2">
              <ChartLineUp size={12} /> Gann Fan Levels (from pivot ₹{gannResult.chosen_pivot?.price?.toFixed?.(2)})
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 text-[11px]">
              {gannResult.gann_fan?.map(g => (
                <div key={g.name} className="bg-black/40 border border-zinc-800 rounded p-2">
                  <div className="font-mono text-cyan-300">{g.name} <span className="text-zinc-500">({g.degrees}°)</span></div>
                  <div className="text-emerald-400">R: ₹{g.resistance_100}</div>
                  <div className="text-rose-400">S: ₹{g.support_100}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Square-of-9 levels */}
          <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
              <span className="flex items-center gap-2"><Lightning size={12} /> Square of 9 — Ring {gannResult.soq_ring}</span>
              <span className="text-zinc-600">{gannResult.soq_levels?.length} levels</span>
            </div>
            <div className="max-h-64 overflow-y-auto p-2 text-[10px] font-mono">
              <table className="w-full">
                <thead className="text-zinc-500 text-left">
                  <tr>
                    <th className="py-1 px-2">#</th>
                    <th className="py-1 px-2">Angle</th>
                    <th className="py-1 px-2 text-emerald-400">Resistance</th>
                    <th className="py-1 px-2 text-rose-400">Support</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {gannResult.soq_levels?.map(l => (
                    <tr key={l.step} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1 px-2 text-zinc-500">{l.step}</td>
                      <td className="py-1 px-2">{l.angle_deg}°</td>
                      <td className="py-1 px-2 text-emerald-300">₹{l.resistance}</td>
                      <td className="py-1 px-2 text-rose-300">₹{l.support}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {gannResult.ensemble?.votes?.map((v, i) => <ModelVoteCard key={i} vote={v} />)}
          </div>
        </div>
      )}

      {!signalResult && !gannResult && !busy && (
        <div className="text-center py-10 text-zinc-600 text-xs">
          <Brain size={36} weight="duotone" className="mx-auto mb-3 text-zinc-700" />
          Pick a stock and hit one of the buttons above to consult the 3-AI ensemble.
        </div>
      )}
    </div>
  );
}
