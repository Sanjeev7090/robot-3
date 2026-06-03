import React, { useState } from 'react';
import axios from 'axios';
import { Brain, Sparkle, TrendUp, TrendDown } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GPTAnalysis = ({ stockData, selectedStock, timeframe }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeWithGPT = async () => {
    if (!stockData || !selectedStock) { toast.error('Select a stock first'); return; }
    setLoading(true);
    try {
      const response = await axios.post(`${API}/ai/gpt-analyze`, {
        ticker: selectedStock.ticker,
        timeframe: timeframe?.label || '1D',
        bars: stockData.bars.slice(-60)
      });
      setAnalysis(response.data);
      toast.success('GPT Analysis complete!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'GPT Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 70) return '#00E676';
    if (conf >= 50) return '#F5A623';
    return '#FF3B30';
  };

  return (
    <div className="p-3" data-testid="gpt-analysis">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkle size={14} className="text-[#A855F7]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">GPT Deep Analysis</span>
        </div>
        <button onClick={analyzeWithGPT} disabled={loading}
          className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#A855F7] text-white hover:bg-[#9333EA] transition-colors disabled:opacity-50"
          data-testid="gpt-analyze-btn">
          {loading ? 'Thinking...' : 'GPT Analyze'}
        </button>
      </div>

      {loading && (
        <div className="py-4 text-center animate-pulse">
          <p className="text-[10px] text-[#A855F7] font-mono">GPT analyzing patterns, SMC, levels...</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          {/* Direction + Confidence */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {analysis.direction === 'Long' ? <TrendUp size={16} className="text-[#00E676]" weight="bold" /> : <TrendDown size={16} className="text-[#FF3B30]" weight="bold" />}
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-black"
                style={{ backgroundColor: analysis.direction === 'Long' ? '#00E676' : '#FF3B30' }}
                data-testid="gpt-direction">
                {analysis.direction}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono" style={{ color: getConfidenceColor(analysis.confidence) }} data-testid="gpt-confidence">
                {analysis.confidence}%
              </span>
              {analysis.risk_reward && (
                <span className="text-[10px] font-mono text-zinc-400">RR: {analysis.risk_reward}</span>
              )}
            </div>
          </div>

          {/* Entry / SL / Targets */}
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-zinc-500">Entry</p>
              <p className="font-mono font-bold text-white" data-testid="gpt-entry">{analysis.entry_price}</p>
            </div>
            <div>
              <p className="text-zinc-500">SL</p>
              <p className="font-mono font-bold text-[#FF3B30]" data-testid="gpt-stoploss">{analysis.stoploss}</p>
            </div>
            <div>
              <p className="text-zinc-500">Targets</p>
              {analysis.targets.map((t, i) => (
                <p key={i} className="font-mono text-[#00E676]">T{i + 1}: {t}</p>
              ))}
            </div>
          </div>

          {/* Key Levels */}
          {analysis.key_levels && analysis.key_levels.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Levels:</span>
              {analysis.key_levels.map((l, i) => (
                <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 border border-white/10 text-zinc-300">{l}</span>
              ))}
            </div>
          )}

          {/* GPT Reasoning */}
          <div className="p-2 bg-[#A855F7]/5 border border-[#A855F7]/20">
            <p className="text-[10px] text-zinc-300 leading-relaxed" data-testid="gpt-reason">{analysis.reason}</p>
          </div>

          <p className="text-[9px] text-zinc-600 font-mono">{timeframe?.label || '1D'} | GPT-4.1 Mini | {new Date().toLocaleTimeString('en-US')}</p>
        </div>
      )}

      {!analysis && !loading && (
        <p className="text-[10px] text-zinc-600">AI-powered deep analysis with SMC, patterns & key levels</p>
      )}
    </div>
  );
};

export default GPTAnalysis;
