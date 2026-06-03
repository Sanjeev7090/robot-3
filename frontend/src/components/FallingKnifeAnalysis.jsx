import React, { useState } from 'react';
import axios from 'axios';
import { TrendDown, Lightning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FallingKnifeAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [enabled, setEnabled] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/falling-knife/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars
      });
      setAnalysis(response.data);
      toast.success('Falling Knife analysis complete!');
      
      // Pass strategy data to parent for chart overlay
      if (onAnalysisComplete) {
        onAnalysisComplete('falling_knife', response.data);
      }
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
    else {
      setAnalysis(null);
      // Clear strategy overlay when disabled
      if (onAnalysisComplete) {
        onAnalysisComplete(null, null);
      }
    }
  };

  return (
    <div className="p-3" data-testid="falling-knife-analysis">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendDown size={14} className="text-[#FF3B30]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Falling Knife</span>
        </div>
        <button
          onClick={handleToggle}
          className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-[#00E676]' : 'bg-zinc-700'}`}
          data-testid="falling-knife-toggle"
        >
          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'translate-x-4.5 left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Analyzing...</p>}

      {enabled && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${analysis.status === 'READY' ? 'text-[#00E676]' : analysis.status === 'SETUP' ? 'text-[#F5A623]' : 'text-[#FF3B30]'}`}>
              {analysis.status}
            </span>
            <span className="text-[10px] text-zinc-500">{analysis.conditions_met}/3 conditions</span>
          </div>

          {analysis.drop_percentage != null && (
            <div className="text-[10px] font-mono">
              <span className="text-zinc-500">Drop: </span>
              <span className={analysis.drop_percentage >= 40 ? 'text-[#00E676]' : 'text-[#FF3B30]'}>
                {analysis.drop_percentage.toFixed(1)}%
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 text-[10px]">
            {[
              { label: 'BB Squeeze', met: analysis.bollinger_squeeze },
              { label: 'Keltner', met: analysis.price_in_keltner },
              { label: 'MACD', met: analysis.macd_bullish },
            ].map((c) => (
              <div key={c.label} className={`py-1 px-2 text-center border ${c.met ? 'border-[#00E676]/30 text-[#00E676]' : 'border-white/5 text-zinc-600'}`}>
                <span className="font-mono">{c.met ? 'Y' : 'N'}</span>
                <p className="text-[8px] mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!enabled && <p className="text-[10px] text-zinc-600">Enable to scan for reversal setups</p>}
    </div>
  );
};

export default FallingKnifeAnalysis;
