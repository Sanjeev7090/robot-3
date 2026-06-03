import React, { useState, useEffect } from 'react';
import { Brain, Target, Lightning, Robot, Check, X, ArrowsClockwise, Sparkle } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/ensemble`;

// ─── Color helpers ───────────────────────────────────────────────────────────
const SIG = {
  BUY:     { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  SELL:    { bg: 'bg-rose-500/15',    border: 'border-rose-500/40',    text: 'text-rose-400',    dot: 'bg-rose-400'    },
  HOLD:    { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
  WAIT:    { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
  ABSTAIN: { bg: 'bg-zinc-800/60',    border: 'border-zinc-700',       text: 'text-zinc-400',    dot: 'bg-zinc-500'    },
};
const sigStyle = (s) => SIG[s] || SIG.ABSTAIN;

const MODEL_META = {
  'Claude Sonnet 4.5': { accent: '#FF6B35', short: 'Claude' },
  'Gemini 3 Pro':      { accent: '#4285F4', short: 'Gemini' },
  'GPT-5.2':           { accent: '#74AA9C', short: 'GPT'    },
  'Kronos AI':         { accent: '#A855F7', short: 'Kronos' },
};
const modelAccent = (name) => (MODEL_META[name] || { accent: '#A1A1AA' }).accent;

const fmt = (v) => (v != null && !isNaN(Number(v)) ? `₹${Number(v).toFixed(2)}` : '—');

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfBar({ value, color = '#00E676' }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

function ModelCard({ num, vote }) {
  const sig = (vote.signal || 'HOLD').toUpperCase();
  const s   = sigStyle(sig);
  const acc = modelAccent(vote.model);
  const ok  = vote.ok !== false;

  return (
    <div
      className="border border-zinc-800 bg-[#0E0E10] rounded-lg overflow-hidden"
      style={{ borderLeftColor: acc, borderLeftWidth: 2 }}
      data-testid={`model-card-${num}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-zinc-800/80">
        {/* Number badge */}
        <div
          className="w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-black flex-shrink-0"
          style={{ background: `${acc}22`, color: acc, border: `1px solid ${acc}44` }}
        >
          {num}
        </div>
        <span className="text-[11px] font-bold text-zinc-200 flex-1 truncate">{vote.model}</span>
        {ok ? (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[10px] font-black tracking-wider ${s.bg} ${s.border} ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {sig}
          </div>
        ) : (
          <span className="text-[9px] text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-sm">FAILED</span>
        )}
      </div>

      {ok ? (
        <div className="px-3 py-2 space-y-2">
          {/* Price grid */}
          <div className="grid grid-cols-5 gap-1 text-center">
            {[
              { label: 'ENTRY',  val: vote.entry_price, color: '#A1A1AA' },
              { label: 'SL',     val: vote.stop_loss,   color: '#FF3B30' },
              { label: 'T1',     val: vote.target_1,    color: '#00E676' },
              { label: 'T2',     val: vote.target_2,    color: '#00C853' },
              { label: 'T3',     val: vote.target_3,    color: '#69F0AE' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-white/3 rounded px-1 py-1">
                <div className="text-[7px] font-bold uppercase tracking-widest" style={{ color }}>{label}</div>
                <div className="text-[9px] font-mono font-bold text-zinc-200 mt-0.5 leading-tight">{fmt(val)}</div>
              </div>
            ))}
          </div>

          {/* Confidence */}
          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <span className="text-zinc-600">Confidence</span>
              <span className="font-mono text-zinc-300">{vote.confidence}%</span>
            </div>
            <ConfBar value={vote.confidence} color={acc} />
          </div>

          {/* Rationale */}
          {vote.rationale && (
            <p className="text-[9px] text-zinc-500 leading-relaxed line-clamp-2">{vote.rationale}</p>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 text-[10px] text-rose-400 flex items-center gap-1.5">
          <X size={12} /> {vote.rationale || vote.error || 'Model did not respond'}
        </div>
      )}
    </div>
  );
}

function ConsensusRow({ verdict }) {
  if (!verdict) return null;
  const sig = verdict.consensus || 'ABSTAIN';
  const s = sigStyle(sig);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${s.bg} ${s.border}`}
      data-testid="ensemble-consensus"
    >
      <div className={`text-base font-black tracking-widest ${s.text}`} data-testid="consensus-signal">
        {sig}
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-[9px] mb-1">
          <span className="text-zinc-500">Ensemble Confidence</span>
          <span className="font-mono text-zinc-200" data-testid="consensus-confidence">{verdict.confidence}%</span>
        </div>
        <ConfBar value={verdict.confidence} color={s.dot.replace('bg-', '#').replace('-400', '')} />
      </div>
      <div className="text-[9px] text-zinc-500">
        {verdict.valid_voters}/{verdict.total_voters} voted
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function EnsembleCockpitPanel({ selectedStock }) {
  const [status, setStatus]           = useState(null);
  const [busy, setBusy]               = useState(false);
  const [activeTask, setActiveTask]   = useState(null);
  const [signalResult, setSignalResult] = useState(null);
  const [gannResult, setGannResult]   = useState(null);
  const [error, setError]             = useState(null);

  useEffect(() => {
    fetch(`${API}/status`).then(r => r.json()).then(setStatus).catch(() => {});
  }, []);

  const ticker = selectedStock?.ticker || selectedStock?.id || 'RELIANCE.NS';

  const runSignal = async () => {
    setBusy(true); setActiveTask('signal'); setError(null);
    try {
      const r    = await fetch(`${API}/signal`, {
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
      setBusy(false); setActiveTask(null);
    }
  };

  const runGann = async () => {
    setBusy(true); setActiveTask('gann'); setError(null);
    try {
      const r    = await fetch(`${API}/gann-optimize`, {
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
      setBusy(false); setActiveTask(null);
    }
  };

  const allModels = signalResult?.verdict?.per_model || [];

  return (
    <div className="flex flex-col bg-[#0A0A0A] text-white min-h-full" data-testid="ensemble-cockpit">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 bg-[#0E0E10]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-[13px]">
              <Brain size={18} weight="duotone" className="text-fuchsia-400" />
              AI Ensemble Cockpit
            </div>
            <p className="text-[9px] text-zinc-500 mt-0.5">
              Claude 4.5 · Gemini 3 Pro · GPT-5.2 · Kronos AI
            </p>
          </div>
          <div className="text-right text-[9px] text-zinc-500">
            <div className="font-mono text-zinc-300">{ticker}</div>
            {status && (
              <div className="mt-0.5 flex items-center justify-end gap-1">
                <span>Mode: {status.provider_mode}</span>
                {status.key_configured
                  ? <Check size={10} className="text-emerald-400" />
                  : <X size={10} className="text-rose-400" />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-3 py-2.5 grid grid-cols-2 gap-2 border-b border-white/5">
        <button
          onClick={runSignal}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 py-2 px-3 border border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-sm"
          data-testid="btn-ask-ensemble-signal"
        >
          {activeTask === 'signal'
            ? <><ArrowsClockwise size={12} className="animate-spin" /> Asking models…</>
            : <><Robot size={13} weight="duotone" /> Ask All Models</>}
        </button>
        <button
          onClick={runGann}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 py-2 px-3 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-sm"
          data-testid="btn-ai-gann-optimize"
        >
          {activeTask === 'gann'
            ? <><ArrowsClockwise size={12} className="animate-spin" /> Optimising…</>
            : <><Target size={13} weight="duotone" /> AI Gann + SoQ</>}
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2.5 text-[10px] text-rose-400 border border-rose-500/30 bg-rose-500/10 rounded px-3 py-2" data-testid="ensemble-error">
          ⚠ {error}
        </div>
      )}

      {/* Model list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {allModels.length > 0 && (
          <div className="mt-3 space-y-2" data-testid="signal-result">
            {/* Consensus */}
            <ConsensusRow verdict={signalResult?.verdict} />

            {/* Numbered model cards */}
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-600 mt-3 mb-1.5">
              Individual Model Analysis ({allModels.length} Models)
            </div>
            {allModels.map((vote, i) => (
              <ModelCard key={i} num={i + 1} vote={vote} />
            ))}

            {/* Kronos not loaded notice */}
            {!signalResult?.kronos_loaded && (
              <div className="border border-[#A855F7]/20 bg-[#A855F7]/5 rounded px-3 py-2">
                <div className="text-[9px] text-[#A855F7] font-bold">Kronos AI — Model Not Loaded</div>
                <div className="text-[9px] text-zinc-500 mt-0.5">
                  Click WARMUP on Kronos panel below to load. Rerun after loading.
                </div>
              </div>
            )}

            {/* Context snapshot */}
            {signalResult?.context && (
              <div className="mt-2 border border-zinc-800/60 rounded bg-[#0E0E10] px-3 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">Market Context</div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-[9px]">
                  {Object.entries(signalResult.context).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-zinc-600 uppercase tracking-wider">{k.replace(/_/g, ' ')}</span>
                      <div className="font-mono text-zinc-300">{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gann result */}
        {gannResult && (
          <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3" data-testid="gann-result">
            <div className="flex items-center gap-2 text-cyan-300 text-[9px] uppercase tracking-[0.15em]">
              <Target size={12} weight="fill" /> AI Gann Pattern Recognition
              <span className="ml-auto text-zinc-500">SoQ ring: {gannResult.soq_ring}</span>
            </div>

            <ConsensusRow verdict={gannResult.ensemble} />

            {/* Gann individual votes */}
            <div className="space-y-2">
              {gannResult.ensemble?.votes?.map((v, i) => <ModelCard key={i} num={i + 1} vote={v} />)}
            </div>

            {/* Pivot */}
            <div className="border border-zinc-800 rounded px-3 py-2 bg-zinc-900/40 text-[9px]">
              <div className="text-zinc-500 uppercase tracking-wider mb-1">AI-Chosen Pivot</div>
              <span className="font-mono text-zinc-200">{gannResult.chosen_pivot?.type}</span>
              <span className="text-zinc-500 ml-2">
                ₹{gannResult.chosen_pivot?.price?.toFixed(2)} · age {gannResult.chosen_pivot?.age_bars} bars
              </span>
            </div>

            {/* Gann Fan levels */}
            <div className="border border-zinc-800 rounded overflow-hidden">
              <div className="px-3 py-1.5 text-[8px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                Gann Fan Levels
              </div>
              <div className="grid grid-cols-2 gap-2 p-2">
                {gannResult.gann_fan?.map(g => (
                  <div key={g.name} className="bg-black/40 border border-zinc-800 rounded p-1.5 text-[9px]">
                    <div className="font-mono text-cyan-300">{g.name} <span className="text-zinc-600">({g.degrees}°)</span></div>
                    <div className="text-emerald-400">R: ₹{g.resistance_100}</div>
                    <div className="text-rose-400">S: ₹{g.support_100}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Square of 9 */}
            <div className="border border-zinc-800 rounded overflow-hidden">
              <div className="px-3 py-1.5 text-[8px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
                <span className="flex items-center gap-1"><Lightning size={10} /> Square of 9 — Ring {gannResult.soq_ring}</span>
                <span>{gannResult.soq_levels?.length} levels</span>
              </div>
              <div className="max-h-48 overflow-y-auto p-2 text-[9px] font-mono">
                <table className="w-full">
                  <thead className="text-zinc-600 text-left">
                    <tr>
                      <th className="py-0.5 px-1">#</th>
                      <th className="py-0.5 px-1">Angle</th>
                      <th className="py-0.5 px-1 text-emerald-400">Res</th>
                      <th className="py-0.5 px-1 text-rose-400">Sup</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {gannResult.soq_levels?.map(l => (
                      <tr key={l.step} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-0.5 px-1 text-zinc-600">{l.step}</td>
                        <td className="py-0.5 px-1">{l.angle_deg}°</td>
                        <td className="py-0.5 px-1 text-emerald-300">₹{l.resistance}</td>
                        <td className="py-0.5 px-1 text-rose-300">₹{l.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!signalResult && !gannResult && !busy && (
          <div className="text-center py-10 text-zinc-600 text-[11px]">
            <Brain size={32} weight="duotone" className="mx-auto mb-3 text-zinc-700" />
            <div>Stock select karo aur <span className="text-fuchsia-400">Ask All Models</span> dabao</div>
            <div className="text-[9px] mt-1 text-zinc-700">Claude · Gemini · GPT · Kronos — sabhi BUY/SELL/SL/Target denge</div>
          </div>
        )}
      </div>
    </div>
  );
}
