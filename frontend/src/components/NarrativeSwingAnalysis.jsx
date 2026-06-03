import React, { useState } from 'react';
import axios from 'axios';
import { ChartLineUp } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// colour helpers
const scoreColour = (s) => {
  if (s > 0.25)  return '#00E676';
  if (s > 0.10)  return '#88FF88';
  if (s > -0.05) return '#FFCC00';
  if (s > -0.15) return '#FF8888';
  return '#FF3B30';
};

const labelColour = (label) => {
  if (label?.includes('STRONG BULLISH')) return '#00E676';
  if (label?.includes('BULLISH'))        return '#88FF88';
  if (label?.includes('STRONG BEARISH')) return '#FF3B30';
  if (label?.includes('BEARISH'))        return '#FF8888';
  return '#FFCC00';
};

// tiny sparkline drawn as an SVG
const ScoreSparkline = ({ values }) => {
  if (!values || values.length < 2) return null;
  const W = 180, H = 32;
  const min = Math.min(...values, -0.3);
  const max = Math.max(...values,  0.3);
  const range = max - min || 0.1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  // zero line
  const zeroY = H - ((0 - min) / range) * H;
  const lastVal = values[values.length - 1];
  const lastX = W;
  const lastY = H - ((lastVal - min) / range) * H;
  return (
    <svg width={W} height={H} className="overflow-visible">
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#ffffff20" strokeWidth={1} strokeDasharray="3,2" />
      <polyline points={pts} fill="none" stroke="#007AFF" strokeWidth={1.2} />
      <circle cx={lastX} cy={lastY} r={2.5} fill={scoreColour(lastVal)} />
    </svg>
  );
};

// mini bar for a single metric
const MetricBar = ({ label, value, min, max, color }) => {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[9px]">
        <span className="text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className="font-mono font-bold" style={{ color }}>{(value * 100).toFixed(2)}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

const NarrativeSwingAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [enabled, setEnabled] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/narrative-swing/analyze`, {
        ticker: selectedStock.ticker,
        bars: stockData.bars,
        buy_threshold: 0.25,
        sell_threshold: -0.15
      });
      setAnalysis(response.data);
      if (onAnalysisComplete) onAnalysisComplete('narrative_swing', response.data);
      toast.success('Narrative Swing analysis complete!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Narrative Swing analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (next && stockData) analyze();
    else setAnalysis(null);
      if (onAnalysisComplete) onAnalysisComplete(null, null);
  };

  const a = analysis;

  return (
    <div className="p-3" data-testid="narrative-swing-analysis">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ChartLineUp size={14} className="text-[#007AFF]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Narrative Swing</span>
          <span className="text-[8px] text-zinc-600">Momentum·Vol·RelPrice</span>
        </div>
        <button
          onClick={handleToggle}
          className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-[#007AFF]' : 'bg-zinc-700'}`}
          data-testid="narrative-swing-toggle"
        >
          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && loading && (
        <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Computing narrative score…</p>
      )}

      {enabled && a && !loading && (
        <div className="animate-fade-in space-y-2">

          {/* Narrative label + score */}
          <div
            className="text-center py-2 border"
            style={{ borderColor: labelColour(a.narrative_label) + '40' }}
          >
            <p
              className="text-base font-black uppercase tracking-tight"
              style={{ color: labelColour(a.narrative_label) }}
              data-testid="narrative-label"
            >
              {a.narrative_label}
            </p>
            <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
              Score&nbsp;
              <span style={{ color: scoreColour(a.narrative_score) }}>
                {a.narrative_score >= 0 ? '+' : ''}{a.narrative_score.toFixed(4)}
              </span>
              &nbsp;·&nbsp;{a.confidence}% conf
            </p>
          </div>

          {/* Signal + Entry/SL/Targets */}
          <SignalIndicator
            signalType={a.signal_type}
            entryPrice={a.entry_price}
            stopLoss={a.stop_loss}
            targets={[a.target1, a.target2, a.target3].filter(Boolean)}
          />

          {/* Risk:Reward */}
          {a.risk_reward && a.signal_type !== 'WAIT' && (
            <div className="flex items-center justify-between text-[9px] px-2 py-1 bg-white/5 border border-white/5">
              <span className="text-zinc-500">Risk:Reward</span>
              <span className="font-mono font-bold text-white">{a.risk_reward}</span>
              <span className="text-zinc-500 ml-2">ATR {a.atr_value?.toFixed(2)}</span>
            </div>
          )}

          {/* Component Metrics */}
          <div className="space-y-1.5 py-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Score Components</p>
            <MetricBar
              label="Momentum (20-bar)"
              value={a.momentum}
              min={-0.3}
              max={0.3}
              color={a.momentum >= 0 ? '#00E676' : '#FF3B30'}
            />
            <MetricBar
              label="Volatility (20-bar)"
              value={a.volatility}
              min={0}
              max={0.05}
              color="#F5A623"
            />
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[9px]">
                <span className="text-zinc-500 uppercase tracking-wider">Rel-Price (÷ MA90)</span>
                <span className="font-mono font-bold" style={{ color: a.rel_price >= 1 ? '#00E676' : '#FF3B30' }}>
                  {a.rel_price.toFixed(4)}×
                </span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((a.rel_price - 0.7) / (1.5 - 0.7)) * 100))}%`,
                    backgroundColor: a.rel_price >= 1 ? '#00E676' : '#FF3B30'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Score Sparkline */}
          {a.score_bars && a.score_bars.length > 2 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Score History (last {a.score_bars.length} bars)
              </p>
              <ScoreSparkline values={a.score_bars} />
            </div>
          )}

          {/* Recommendation */}
          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{a.recommendation}</p>
          </div>

          {/* Threshold reference */}
          <div className="flex gap-2 text-[9px]">
            <span className="text-zinc-600">Buy&nbsp;&gt;&nbsp;
              <span className="text-[#00E676] font-mono">+0.25</span>
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-600">Sell&nbsp;&lt;&nbsp;
              <span className="text-[#FF3B30] font-mono">-0.15</span>
            </span>
          </div>
        </div>
      )}

      {!enabled && (
        <p className="text-[10px] text-zinc-600">
          Momentum × Volatility × Rel-Price narrative score
        </p>
      )}
    </div>
  );
};

export default NarrativeSwingAnalysis;
