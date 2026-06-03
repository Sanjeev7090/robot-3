import React, { useState } from 'react';
import axios from 'axios';
import { ArrowsClockwise, TrendUp, TrendDown } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ReversePriceSwings = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [activeMethod, setActiveMethod] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeSwings = async (method) => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/reverse-swings/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars, force_method: method
      });
      setAnalysis(response.data);
      if (onAnalysisComplete) onAnalysisComplete('reverse_swings', response.data);
      toast.success(`Method ${method} analysis complete!`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMethodClick = (method) => {
    if (activeMethod === method) { setActiveMethod(null); setAnalysis(null); }
    else { setActiveMethod(method); analyzeSwings(method); }
  };

  return (
    <div className="p-3" data-testid="reverse-swings">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ArrowsClockwise size={14} className="text-[#A855F7]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Reverse Swings</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => handleMethodClick('A')}
            disabled={loading}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all ${activeMethod === 'A' ? 'bg-[#00E676] text-black' : 'text-zinc-500 hover:text-white'}`}
            data-testid="method-a-button"
          >A</button>
          <button
            onClick={() => handleMethodClick('B')}
            disabled={loading}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all ${activeMethod === 'B' ? 'bg-[#FF3B30] text-white' : 'text-zinc-500 hover:text-white'}`}
            data-testid="method-b-button"
          >B</button>
        </div>
      </div>

      {activeMethod && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Analyzing...</p>}

      {activeMethod && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          <div className="flex items-center gap-2 text-[10px]">
            {analysis.method === 'A' ? <TrendUp size={12} className="text-[#00E676]" /> : <TrendDown size={12} className="text-[#FF3B30]" />}
            <span className="text-zinc-400">Method {analysis.method} - {analysis.method === 'A' ? 'Long' : 'Short'}</span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <div className={`py-1 px-2 text-center border ${analysis.trend_confirmed ? 'border-[#00E676]/30 text-[#00E676]' : 'border-white/5 text-zinc-600'}`}>
              <span className="font-mono">{analysis.trend_confirmed ? 'Y' : 'N'}</span>
              <p className="text-[8px] mt-0.5">Trend</p>
            </div>
            <div className={`py-1 px-2 text-center border ${analysis.swing_signal ? 'border-[#00E676]/30 text-[#00E676]' : 'border-white/5 text-zinc-600'}`}>
              <span className="font-mono">{analysis.swing_signal ? 'Y' : 'N'}</span>
              <p className="text-[8px] mt-0.5">Swing</p>
            </div>
            <div className={`py-1 px-2 text-center border ${analysis.valid_entry_day ? 'border-[#00E676]/30 text-[#00E676]' : 'border-white/5 text-zinc-600'}`}>
              <span className="font-mono">{analysis.valid_entry_day ? 'Y' : 'N'}</span>
              <p className="text-[8px] mt-0.5">Day</p>
            </div>
          </div>

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!activeMethod && <p className="text-[10px] text-zinc-600">A: Long (Oversold) | B: Short (Overbought)</p>}
    </div>
  );
};

export default ReversePriceSwings;
