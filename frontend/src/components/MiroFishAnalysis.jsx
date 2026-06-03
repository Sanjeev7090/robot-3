/**
 * MiroFish v2 — LangGraph Multi-Agent Analysis UI
 * Shows real-time streaming as each agent completes its analysis.
 *
 * Agent pipeline (SSE stream):
 *  Technical Analyst → Volume & Orderflow → Sentiment (News+X) → Risk Manager → Decision Agent
 */
import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  FishSimple, ChartBar, ChartLine, Newspaper, ShieldCheck,
  Lightning, ArrowRight, CircleNotch, CheckCircle, Clock,
  TrendUp, TrendDown, Minus, ArrowUp, ArrowDown, Target,
  Scales, Warning,
} from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Agent metadata (matches backend) ───────────────────────────────────────
const AGENT_DEFS = [
  {
    key:   'technical',
    node:  'technical_agent',
    label: 'Technical Analyst',
    desc:  'RSI · EMA · MACD · Bollinger',
    Icon:  ChartBar,
    color: 'orange',
    tw: {
      ring:    'border-orange-500/40',
      bg:      'bg-orange-500/8',
      text:    'text-orange-400',
      badge:   'bg-orange-500/20 text-orange-300',
      glow:    'shadow-orange-500/20',
    },
  },
  {
    key:   'volume',
    node:  'volume_agent',
    label: 'Volume & Orderflow',
    desc:  'OBV · Volume Ratio · Orderflow',
    Icon:  ChartLine,
    color: 'sky',
    tw: {
      ring:    'border-sky-500/40',
      bg:      'bg-sky-500/8',
      text:    'text-sky-400',
      badge:   'bg-sky-500/20 text-sky-300',
      glow:    'shadow-sky-500/20',
    },
  },
  {
    key:   'sentiment',
    node:  'sentiment_agent',
    label: 'Sentiment (News+X)',
    desc:  'Yahoo Finance · Twitter/X Buzz',
    Icon:  Newspaper,
    color: 'purple',
    tw: {
      ring:    'border-purple-500/40',
      bg:      'bg-purple-500/8',
      text:    'text-purple-400',
      badge:   'bg-purple-500/20 text-purple-300',
      glow:    'shadow-purple-500/20',
    },
  },
  {
    key:   'risk',
    node:  'risk_agent',
    label: 'Risk Manager',
    desc:  'ATR · SL · Risk/Reward',
    Icon:  ShieldCheck,
    color: 'yellow',
    tw: {
      ring:    'border-yellow-500/40',
      bg:      'bg-yellow-500/8',
      text:    'text-yellow-400',
      badge:   'bg-yellow-500/20 text-yellow-300',
      glow:    'shadow-yellow-500/20',
    },
  },
  {
    key:   'decision',
    node:  'decision_agent',
    label: 'Decision Agent',
    desc:  'Final Vote · Entry · Targets',
    Icon:  Lightning,
    color: 'emerald',
    tw: {
      ring:    'border-emerald-500/40',
      bg:      'bg-emerald-500/8',
      text:    'text-emerald-400',
      badge:   'bg-emerald-500/20 text-emerald-300',
      glow:    'shadow-emerald-500/20',
    },
  },
];

// ─── Small helpers ───────────────────────────────────────────────────────────

const VerdictPill = ({ v }) => {
  if (!v) return null;
  const val = (v || '').toUpperCase();
  const cls =
    val === 'BUY'   ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
    val === 'SELL'  ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
    val === 'WAIT'  ? 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30' :
                     'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20';
  return (
    <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded ${cls}`}>
      {val}
    </span>
  );
};

const SignalIcon = ({ signal }) => {
  const s = (signal || '').toUpperCase();
  if (s === 'BUY')  return <TrendUp  size={18} weight="bold" className="text-emerald-400" />;
  if (s === 'SELL') return <TrendDown size={18} weight="bold" className="text-red-400" />;
  return <Minus size={18} weight="bold" className="text-zinc-400" />;
};

const ConfidenceBar = ({ value, color = 'emerald' }) => {
  const pct = Math.min(Math.max(Number(value) || 0, 0), 100);
  const barColor =
    color === 'orange' ? 'bg-orange-400' :
    color === 'sky'    ? 'bg-sky-400'    :
    color === 'purple' ? 'bg-purple-400' :
    color === 'yellow' ? 'bg-yellow-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-0.5 bg-white/5 dark:bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[9px] font-mono font-bold ${
        color === 'orange' ? 'text-orange-400' : color === 'sky' ? 'text-sky-400' :
        color === 'purple' ? 'text-purple-400' : color === 'yellow' ? 'text-yellow-400' : 'text-emerald-400'
      }`}>{pct}%</span>
    </div>
  );
};

// ─── Single agent card ───────────────────────────────────────────────────────

const AgentCard = ({ def, status, data, step, activeStep }) => {
  const { Icon, label, desc, tw } = def;
  const isPending  = status === 'pending';
  const isThinking = status === 'thinking';
  const isDone     = status === 'done';

  const verdict = data?.verdict || data?.recommended_action;
  const conf    = data?.confidence;
  const reason  = data?.reasoning;

  return (
    <div className={`relative rounded border transition-all duration-500 ${
      isDone     ? `${tw.ring} ${tw.bg} shadow-lg ${tw.glow}` :
      isThinking ? 'border-white/20 dark:border-white/20 bg-white/[0.03] dark:bg-white/[0.03] shadow-md' :
                   'border-white/5 dark:border-white/5 bg-white/[0.01] dark:bg-white/[0.01] opacity-40'
    }`}>

      {/* Thinking shimmer */}
      {isThinking && (
        <div className="absolute inset-0 rounded overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
        </div>
      )}

      <div className="p-2.5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5">
          {/* Step bubble */}
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
            isDone     ? `${tw.bg} ${tw.text} ring-1 ${tw.ring}` :
            isThinking ? 'bg-white/10 text-white animate-pulse' :
                         'bg-white/5 text-zinc-600'
          }`}>
            {isDone ? <CheckCircle size={11} weight="fill" /> : step}
          </div>

          <Icon size={12} weight={isDone ? 'fill' : 'regular'} className={
            isDone ? tw.text : isThinking ? 'text-white/60' : 'text-zinc-600'
          } />

          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold truncate ${
              isDone ? tw.text : isThinking ? 'text-white/80 dark:text-white/80' : 'text-zinc-600'
            }`}>{label}</p>
            <p className={`text-[8px] ${isDone ? 'text-white/40 dark:text-white/40' : 'text-zinc-700'}`}>{desc}</p>
          </div>

          {/* Status chip */}
          {isPending  && <span className="text-[8px] text-zinc-600 font-mono uppercase tracking-wider">waiting</span>}
          {isThinking && (
            <span className="flex items-center gap-1 text-[8px] text-white/60 font-mono uppercase tracking-wider">
              <CircleNotch size={9} className="animate-spin" />thinking
            </span>
          )}
          {isDone && verdict && <VerdictPill v={verdict} />}
        </div>

        {/* Content when done */}
        {isDone && data && (
          <div className="space-y-1.5 mt-2 pt-2 border-t border-white/5 dark:border-white/5">
            {/* Confidence bar */}
            {conf !== undefined && <ConfidenceBar value={conf} color={def.color} />}

            {/* Reasoning */}
            {reason && (
              <p className="text-[9px] text-slate-400 dark:text-zinc-400 leading-relaxed">{reason}</p>
            )}

            {/* Agent-specific extra fields */}
            {def.key === 'technical' && (
              <div className="flex flex-wrap gap-1 mt-1">
                {data.trend && (
                  <span className="text-[8px] font-mono bg-white/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">
                    {data.trend}
                  </span>
                )}
                {data.signal_strength && (
                  <span className="text-[8px] font-mono bg-white/5 dark:bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">
                    {data.signal_strength}
                  </span>
                )}
                {data.key_support && (
                  <span className="text-[8px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded text-emerald-400">
                    S: ₹{data.key_support}
                  </span>
                )}
                {data.key_resistance && (
                  <span className="text-[8px] font-mono bg-red-500/10 px-1.5 py-0.5 rounded text-red-400">
                    R: ₹{data.key_resistance}
                  </span>
                )}
              </div>
            )}

            {def.key === 'volume' && (
              <div className="flex flex-wrap gap-1 mt-1">
                {data.orderflow_signal && (
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                    data.orderflow_signal === 'ACCUMULATION' ? 'bg-emerald-500/10 text-emerald-400' :
                    data.orderflow_signal === 'DISTRIBUTION' ? 'bg-red-500/10 text-red-400' :
                    'bg-white/5 dark:bg-white/5 text-zinc-400'
                  }`}>{data.orderflow_signal}</span>
                )}
                {data.confirms_technical !== undefined && (
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                    data.confirms_technical ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'
                  }`}>{data.confirms_technical ? '✓ CONFIRMS TECH' : '⚠ DIVERGES'}</span>
                )}
              </div>
            )}

            {def.key === 'sentiment' && (
              <div className="space-y-1 mt-1">
                <div className="flex gap-1 flex-wrap">
                  {data.news_sentiment && (
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                      data.news_sentiment === 'POSITIVE' ? 'bg-emerald-500/10 text-emerald-400' :
                      data.news_sentiment === 'NEGATIVE' ? 'bg-red-500/10 text-red-400' :
                      'bg-white/5 dark:bg-white/5 text-zinc-400'
                    }`}>📰 {data.news_sentiment}</span>
                  )}
                  {data.twitter_sentiment && (
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                      data.twitter_sentiment === 'POSITIVE' ? 'bg-emerald-500/10 text-emerald-400' :
                      data.twitter_sentiment === 'NEGATIVE' ? 'bg-red-500/10 text-red-400' :
                      'bg-white/5 dark:bg-white/5 text-zinc-400'
                    }`}>𝕏 {data.twitter_sentiment}</span>
                  )}
                  {data.buzz_level && (
                    <span className="text-[8px] font-mono bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">
                      🔥 {data.buzz_level} BUZZ
                    </span>
                  )}
                </div>
                {data.news_summary && (
                  <p className="text-[8px] text-zinc-500 italic leading-snug">{data.news_summary}</p>
                )}
              </div>
            )}

            {def.key === 'risk' && (
              <div className="flex flex-wrap gap-1 mt-1">
                {data.sl_price && (
                  <span className="text-[8px] font-mono bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                    SL ₹{data.sl_price}
                  </span>
                )}
                {data.risk_level && (
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                    data.risk_level === 'LOW'     ? 'bg-emerald-500/10 text-emerald-400' :
                    data.risk_level === 'MEDIUM'  ? 'bg-yellow-500/10 text-yellow-400' :
                    data.risk_level === 'HIGH'    ? 'bg-orange-500/10 text-orange-400' :
                    'bg-red-500/10 text-red-400'
                  }`}>⚠ {data.risk_level} RISK</span>
                )}
                {data.risk_reward && (
                  <span className="text-[8px] font-mono bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded">
                    R:R {data.risk_reward}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Final Decision Card ─────────────────────────────────────────────────────

const FinalDecision = ({ decision }) => {
  if (!decision) return null;
  const sig = (decision.signal || '').toUpperCase();
  const isBuy  = sig === 'BUY';
  const isSell = sig === 'SELL';

  const sigCls =
    isBuy  ? 'bg-emerald-500 text-black' :
    isSell ? 'bg-red-500 text-white' :
             'bg-zinc-600 text-white';

  const borderCls =
    isBuy  ? 'border-emerald-500/40' :
    isSell ? 'border-red-500/40' :
             'border-zinc-500/30';

  const bgCls =
    isBuy  ? 'bg-emerald-500/5' :
    isSell ? 'bg-red-500/5' :
             'bg-zinc-500/5';

  return (
    <div className={`rounded border ${borderCls} ${bgCls} p-3 mt-2`} data-testid="mirofish-final-decision">
      {/* Signal header */}
      <div className="flex items-center gap-2 mb-3">
        <SignalIcon signal={sig} />
        <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded ${sigCls}`}>
          {sig || 'WAIT'}
        </span>
        <span className="text-xs text-slate-400 dark:text-zinc-400 font-mono ml-auto">
          {decision.swarm_consensus} · {decision.consensus_score}%
        </span>
      </div>

      {/* Trade levels grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="rounded bg-white/[0.03] dark:bg-white/[0.03] p-2 text-center">
          <p className="text-[8px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Entry</p>
          <p className="text-xs font-mono font-bold text-slate-800 dark:text-white">₹{decision.entry_price}</p>
        </div>
        <div className="rounded bg-red-500/8 p-2 text-center">
          <p className="text-[8px] text-red-400 uppercase tracking-wider mb-0.5">Stop Loss</p>
          <p className="text-xs font-mono font-bold text-red-400">₹{decision.stop_loss}</p>
        </div>
        <div className="rounded bg-emerald-500/8 p-2 text-center">
          <p className="text-[8px] text-emerald-400 uppercase tracking-wider mb-0.5">Day Target</p>
          <p className="text-xs font-mono font-bold text-emerald-400">
            {decision.day_target && decision.day_target !== 'null' ? `₹${decision.day_target}` : `₹${decision.targets?.[0] || '—'}`}
          </p>
        </div>
      </div>

      {/* Targets T1 T2 T3 */}
      {decision.targets?.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[8px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider shrink-0">Targets:</span>
          {decision.targets.map((t, i) => (
            <span key={i} className={`flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
              isBuy ? 'bg-emerald-500/15 text-emerald-400' :
              isSell ? 'bg-red-500/15 text-red-400' :
              'bg-zinc-500/15 text-zinc-400'
            }`}>
              {isBuy ? <ArrowUp size={8} weight="bold" /> : <ArrowDown size={8} weight="bold" />}
              T{i + 1} ₹{t}
            </span>
          ))}
          {decision.risk_reward && (
            <span className="ml-auto text-[9px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
              R:R {decision.risk_reward}
            </span>
          )}
        </div>
      )}

      {/* Confidence bar */}
      <ConfidenceBar value={decision.confidence} color="emerald" />

      {/* Recommendation */}
      {decision.recommendation && (
        <p className="text-[9px] text-slate-500 dark:text-zinc-400 leading-relaxed mt-2 border-t border-white/5 dark:border-white/5 pt-2">
          {decision.recommendation}
        </p>
      )}

      {/* News catalyst */}
      {decision.news_catalyst && decision.news_catalyst !== 'None' && (
        <p className="text-[8px] text-purple-400 mt-1.5 flex items-start gap-1">
          <Newspaper size={8} className="shrink-0 mt-0.5" weight="fill" />
          {decision.news_catalyst}
        </p>
      )}
    </div>
  );
};

// ─── Progress bar ────────────────────────────────────────────────────────────

const PipelineProgress = ({ progress, activeLabel }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[8px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
        {activeLabel ? `Running: ${activeLabel}` : progress >= 100 ? 'Analysis complete' : 'Initializing…'}
      </span>
      <span className="text-[8px] font-mono text-[#00E676]">{progress}%</span>
    </div>
    <div className="h-0.5 bg-white/5 dark:bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-[#00E676] to-emerald-400 transition-all duration-700 rounded-full"
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);

// ─── Main component ──────────────────────────────────────────────────────────

const MiroFishAnalysis = ({ stockData, selectedStock }) => {
  const [agentStatuses, setAgentStatuses] = useState({});   // key → 'pending'|'thinking'|'done'
  const [agentData,     setAgentData]     = useState({});   // key → agent output dict
  const [finalDecision, setFinalDecision] = useState(null);
  const [progress,      setProgress]      = useState(0);
  const [activeLabel,   setActiveLabel]   = useState('');
  const [running,       setRunning]       = useState(false);
  const [started,       setStarted]       = useState(false);
  const abortRef = useRef(null);

  const runAnalysis = useCallback(async () => {
    if (!stockData?.bars?.length) {
      toast.error('No chart data loaded — select a stock first');
      return;
    }

    // Reset
    setRunning(true);
    setStarted(true);
    setFinalDecision(null);
    setProgress(0);
    setActiveLabel('');
    setAgentData({});
    // Mark all as pending, first as thinking
    setAgentStatuses({
      technical: 'thinking',
      volume:    'pending',
      sentiment: 'pending',
      risk:      'pending',
      decision:  'pending',
    });

    const ticker = selectedStock?.ticker || selectedStock?.coin_id || 'UNKNOWN';

    try {
      const resp = await fetch(`${API}/mirofish/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ticker,
          bars:      stockData.bars.slice(-60),
          timeframe: '1D',
        }),
        signal: (abortRef.current = new AbortController()).signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      // Map node name → agent key
      const nodeToKey = {
        technical_agent: 'technical',
        volume_agent:    'volume',
        sentiment_agent: 'sentiment',
        risk_agent:      'risk',
        decision_agent:  'decision',
      };
      const keyOrder = ['technical', 'volume', 'sentiment', 'risk', 'decision'];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';   // keep last (possibly incomplete) line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { setProgress(100); setActiveLabel(''); break; }

          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }

          if (evt.type === 'start') {
            // received start event with indicators — nothing extra needed
          } else if (evt.type === 'agent_done') {
            const agentKey = nodeToKey[evt.node] || evt.agent_key;
            const data     = evt.data || {};

            // Mark this agent done, find next
            const idx     = keyOrder.indexOf(agentKey);
            const nextKey = keyOrder[idx + 1];

            setAgentStatuses(prev => ({
              ...prev,
              [agentKey]: 'done',
              ...(nextKey ? { [nextKey]: 'thinking' } : {}),
            }));
            setAgentData(prev => ({ ...prev, [agentKey]: data }));
            setProgress(evt.progress || (idx + 1) * 20);
            setActiveLabel(nextKey
              ? AGENT_DEFS.find(d => d.key === nextKey)?.label || ''
              : '');

            if (agentKey === 'decision') {
              setFinalDecision(data);
              const sig = (data.signal || '').toUpperCase();
              if (sig === 'BUY' || sig === 'SELL') {
                toast.success(
                  `MiroFish ${sig} — ${data.swarm_consensus} · ${data.confidence}% confidence`,
                  { duration: 4000 }
                );
              }
            }
          } else if (evt.type === 'error') {
            toast.error(`Agent error: ${evt.message}`);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error(err.message || 'MiroFish analysis failed');
        console.error('MiroFish error:', err);
      }
    } finally {
      setRunning(false);
      setActiveLabel('');
    }
  }, [stockData, selectedStock]);

  const stopAnalysis = () => {
    abortRef.current?.abort();
    setRunning(false);
    setActiveLabel('');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-2 h-full overflow-y-auto space-y-2" data-testid="mirofish-panel">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FishSimple size={14} weight="fill" className="text-[#00E676]" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white">
              MiroFish <span className="text-[#00E676]">v2</span>
            </p>
            <p className="text-[8px] text-slate-400 dark:text-zinc-500">LangGraph · 5-Agent Pipeline</p>
          </div>
        </div>

        {/* Run / Stop button */}
        <button
          onClick={running ? stopAnalysis : runAnalysis}
          disabled={!stockData?.bars?.length}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
            running
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-[#00E676] text-black hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed'
          }`}
          data-testid="mirofish-run-btn"
        >
          {running
            ? <><CircleNotch size={10} className="animate-spin" />Stop</>
            : <><Lightning size={10} weight="fill" />{started ? 'Re-run' : 'Run Analysis'}</>
          }
        </button>
      </div>

      {/* Idle state (before first run) */}
      {!started && (
        <div className="rounded border border-white/5 dark:border-white/5 p-4 text-center">
          <div className="flex justify-center gap-0.5 mb-3 opacity-40">
            {AGENT_DEFS.map((d, i) => (
              <React.Fragment key={d.key}>
                <d.Icon size={14} className={d.tw.text} />
                {i < 4 && <ArrowRight size={8} className="text-zinc-600 self-center" />}
              </React.Fragment>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 mb-1">5-Agent LangGraph workflow</p>
          <p className="text-[8px] text-slate-300 dark:text-zinc-600">
            Technical → Volume → Sentiment → Risk → Decision
          </p>
        </div>
      )}

      {/* Pipeline (visible after starting) */}
      {started && (
        <>
          <PipelineProgress progress={progress} activeLabel={activeLabel} />

          <div className="space-y-1.5">
            {AGENT_DEFS.map((def, i) => (
              <AgentCard
                key={def.key}
                def={def}
                status={agentStatuses[def.key] || 'pending'}
                data={agentData[def.key]}
                step={i + 1}
                activeStep={progress / 20}
              />
            ))}
          </div>

          {/* Final decision */}
          {finalDecision && <FinalDecision decision={finalDecision} />}

          {/* Running indicator */}
          {running && !finalDecision && (
            <div className="text-center py-2">
              <p className="text-[9px] text-slate-400 dark:text-zinc-500 flex items-center justify-center gap-1">
                <CircleNotch size={10} className="animate-spin text-[#00E676]" />
                Agents running in pipeline…
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MiroFishAnalysis;
