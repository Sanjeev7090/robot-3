import React, { useState } from 'react';
import axios from 'axios';
import { Lightning, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ExplosiveVolumeAnalysis = ({ stockData, selectedStock }) => {
  const [activeOption, setActiveOption] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async (option) => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/explosive-volume/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars, force_option: option
      });
      setAnalysis(response.data);
      toast.success('Explosive Volume analysis complete!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionClick = (option) => {
    if (activeOption === option) { setActiveOption(null); setAnalysis(null); }
    else { setActiveOption(option); analyze(option); }
  };

  return (
    <div className="p-3" data-testid="explosive-volume">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightning size={14} className="text-[#F5A623]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Explosive Vol</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => handleOptionClick('A')}
            disabled={loading}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all ${activeOption === 'A' ? 'bg-[#00E676] text-black' : 'text-zinc-500 hover:text-white'}`}
            data-testid="explosive-option-a-button"
          >A</button>
          <button
            onClick={() => handleOptionClick('B')}
            disabled={loading}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all ${activeOption === 'B' ? 'bg-[#FF3B30] text-white' : 'text-zinc-500 hover:text-white'}`}
            data-testid="explosive-option-b-button"
          >B</button>
        </div>
      </div>

      {activeOption && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Scanning...</p>}

      {activeOption && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          <div className="flex items-center gap-2 text-[10px]">
            <span className={`font-bold uppercase ${analysis.status === 'EXPLOSIVE' ? 'text-[#00E676]' : analysis.status === 'BUILDING' ? 'text-[#F5A623]' : 'text-zinc-500'}`}>
              {analysis.status}
            </span>
            <span className="text-zinc-500">{analysis.conditions_met}/{analysis.total_conditions}</span>
          </div>

          {analysis.warnings && analysis.warnings.length > 0 && (
            <div className="space-y-0.5">
              {analysis.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px] text-[#F5A623]">
                  <Warning size={10} weight="bold" /> {w}
                </div>
              ))}
            </div>
          )}

          {analysis.technical_conditions && (
            <div className="space-y-0.5">
              {Object.entries(analysis.technical_conditions).map(([key, cond]) => (
                <div key={key} className="flex justify-between text-[10px] py-0.5 border-b border-white/5">
                  <span className="text-zinc-500">{key.replace(/_/g, ' ')}</span>
                  <span className={cond.met ? 'text-[#00E676] font-mono' : 'text-zinc-600 font-mono'}>{cond.met ? 'Y' : 'N'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!activeOption && <p className="text-[10px] text-zinc-600">A: CCI Exit | B: Oscillator Exit</p>}
    </div>
  );
};

export default ExplosiveVolumeAnalysis;
