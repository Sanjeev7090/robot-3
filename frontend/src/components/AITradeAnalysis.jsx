import React, { useState } from 'react';
import axios from 'axios';
import { Brain, TrendUp, TrendDown } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AITradeAnalysis = ({ stockData, selectedStock, timeframe }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeChart = async () => {
    if (!stockData || !selectedStock) { toast.error('Please select a stock first'); return; }
    setLoading(true);
    try {
      const response = await axios.post(`${API}/ai/analyze-chart`, {
        ticker: selectedStock.ticker, timeframe: timeframe.label, bars: stockData.bars.slice(-60)
      });
      setAnalysis(response.data);
      toast.success('Analysis complete!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3" data-testid="ai-trade-analysis">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-[#007AFF]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">AI Analysis</span>
        </div>
        <button
          onClick={analyzeChart}
          disabled={loading}
          className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
          data-testid="ai-analyze-btn"
        >
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {analysis && (
        <div className="animate-fade-in space-y-2">
          <div className="flex items-center gap-2">
            {analysis.direction === 'Long' ? <TrendUp size={16} className="text-[#00E676]" weight="bold" /> : <TrendDown size={16} className="text-[#FF3B30]" weight="bold" />}
            <span
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-black"
              style={{ backgroundColor: analysis.direction === 'Long' ? '#00E676' : '#FF3B30' }}
              data-testid="ai-direction-badge"
            >
              {analysis.direction}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-zinc-500">Entry</p>
              <p className="font-mono font-bold text-white">{analysis.entry_price}</p>
            </div>
            <div>
              <p className="text-zinc-500">SL</p>
              <p className="font-mono font-bold text-[#FF3B30]">{analysis.stoploss}</p>
            </div>
            <div>
              <p className="text-zinc-500">Targets</p>
              {analysis.targets.map((t, i) => (
                <p key={i} className="font-mono text-[#00E676]">T{i + 1}: {t}</p>
              ))}
            </div>
          </div>

          <div className="mt-2 p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.reason}</p>
          </div>
          <p className="text-[9px] text-zinc-600 font-mono">{timeframe.label} | {new Date().toLocaleTimeString('en-US')}</p>
        </div>
      )}

      {!analysis && !loading && (
        <p className="text-[10px] text-zinc-600">Click Analyze for AI-powered trade setup</p>
      )}
    </div>
  );
};

export default AITradeAnalysis;
