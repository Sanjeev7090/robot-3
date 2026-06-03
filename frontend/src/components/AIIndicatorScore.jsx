import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Gauge, Bell, BellSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const playAlertSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); gain.gain.value = 0.3;
    osc.frequency.value = type === 'buy' ? 880 : 440;
    osc.type = type === 'buy' ? 'sine' : 'square';
    osc.start(); osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination); g2.gain.value = 0.3;
      o2.frequency.value = type === 'buy' ? 1100 : 330;
      o2.type = type === 'buy' ? 'sine' : 'square';
      o2.start(); o2.stop(ctx.currentTime + 0.4);
    }, 300);
  } catch (e) {}
};

const getScoreColor = (score) => {
  if (score >= 70) return '#00E676';
  if (score <= 30) return '#FF3B30';
  if (score >= 55) return '#F5A623';
  if (score <= 45) return '#FF8800';
  return '#888';
};

const AIIndicatorScore = ({ stockData, selectedStock }) => {
  const [enabled, setEnabled] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const prevSignalRef = useRef(null);

  const checkAlert = useCallback((data) => {
    if (!alertEnabled) return;
    const sig = data.signal_type;
    if (sig !== prevSignalRef.current) {
      if (sig === 'BUY') { playAlertSound('buy'); toast.success(`AI Alert: BUY! Score ${data.ai_score}`, { duration: 5000 }); }
      else if (sig === 'SELL') { playAlertSound('sell'); toast.error(`AI Alert: SELL! Score ${data.ai_score}`, { duration: 5000 }); }
      prevSignalRef.current = sig;
    }
  }, [alertEnabled]);

  const analyze = async () => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/ai-indicator/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars
      });
      setAnalysis(response.data);
      checkAlert(response.data);
      toast.success('AI Indicator analysis complete!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (next && stockData) analyze();
    else setAnalysis(null);
  };

  return (
    <div className="p-3" data-testid="ai-indicator">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Gauge size={14} className="text-[#007AFF]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">AI Indicator</span>
        </div>
        <div className="flex items-center gap-2">
          {enabled && (
            <button
              onClick={() => setAlertEnabled(!alertEnabled)}
              className={`p-0.5 transition-all ${alertEnabled ? 'text-[#A855F7]' : 'text-zinc-600'}`}
              data-testid="ai-alert-toggle"
            >
              {alertEnabled ? <Bell size={12} weight="fill" /> : <BellSlash size={12} />}
            </button>
          )}
          <button
            onClick={handleToggle}
            className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-[#00E676]' : 'bg-zinc-700'}`}
            data-testid="ai-indicator-toggle"
          >
            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {enabled && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Computing AI Score...</p>}

      {enabled && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          {/* Score Display */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-2xl font-mono font-bold" style={{ color: getScoreColor(analysis.ai_score) }} data-testid="ai-score">{analysis.ai_score}</p>
              <p className="text-[9px] text-zinc-500">/100</p>
            </div>
            <div className="flex-1">
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500 rounded-full" style={{ width: `${analysis.ai_score}%`, backgroundColor: getScoreColor(analysis.ai_score) }} />
              </div>
              <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5 font-mono">
                <span>SELL &lt;30</span><span>HOLD</span><span>&gt;70 BUY</span>
              </div>
            </div>
          </div>

          {analysis.volume_confirmation && (
            <div className="text-[10px] text-[#00E676] font-mono">Volume Spike Confirmed</div>
          )}

          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          {/* Indicator Breakdown */}
          {analysis.indicator_scores && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Breakdown</p>
              {Object.entries(analysis.indicator_scores).map(([key, ind]) => (
                <div key={key} className="flex items-center gap-2 text-[10px]">
                  <span className="text-zinc-500 w-16 truncate">{key.toUpperCase()}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${ind.score}%`, backgroundColor: getScoreColor(ind.score) }} />
                  </div>
                  <span className="font-mono w-8 text-right" style={{ color: getScoreColor(ind.score) }}>{ind.score}</span>
                </div>
              ))}
            </div>
          )}

          {analysis.exit_rules && (
            <div className="text-[10px] space-y-0.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Exit Rules</p>
              <div className="flex justify-between border-b border-white/5 py-0.5"><span className="text-zinc-500">SL</span><span className="font-mono">{analysis.exit_rules.stop_loss_pct}</span></div>
              <div className="flex justify-between border-b border-white/5 py-0.5"><span className="text-zinc-500">Time</span><span className="font-mono">{analysis.exit_rules.time_exit}</span></div>
              <div className="flex justify-between border-b border-white/5 py-0.5"><span className="text-zinc-500">Trail</span><span className="font-mono">{analysis.exit_rules.trailing}</span></div>
            </div>
          )}

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!enabled && <p className="text-[10px] text-zinc-600">DMI 30% + MA 25% + MACD 20% + RSI 15% + Stoch 10%</p>}
    </div>
  );
};

export default AIIndicatorScore;
