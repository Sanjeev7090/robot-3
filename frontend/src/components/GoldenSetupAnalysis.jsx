import React, { useState } from 'react';
import axios from 'axios';
import { Star, Lightning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GoldenSetupAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [enabled, setEnabled] = useState(false);
  const [proMode, setProMode] = useState(false);
  const [mtfEnabled, setMtfEnabled] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async (isPro, mtf) => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/golden-setup/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars, pro_mode: isPro, multi_timeframe: mtf || mtfEnabled
      });
      setAnalysis(response.data);
      if (onAnalysisComplete) onAnalysisComplete('golden_setup', response.data);
      toast.success(`Golden Setup ${isPro ? 'Pro' : 'Normal'} complete!`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (next && stockData) analyze(proMode);
    else setAnalysis(null);
      if (onAnalysisComplete) onAnalysisComplete(null, null);
  };

  const handleProToggle = () => {
    const next = !proMode;
    setProMode(next);
    if (enabled && stockData) analyze(next);
  };

  const handleMtfToggle = () => {
    const next = !mtfEnabled;
    setMtfEnabled(next);
    if (enabled && stockData) analyze(proMode, next);
  };

  return (
    <div className="p-3" data-testid="golden-setup">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-[#F5A623]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Golden Setup</span>
        </div>
        <div className="flex items-center gap-2">
          {enabled && (
            <>
              <button onClick={handleProToggle} className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${proMode ? 'bg-[#FF0055] text-white' : 'text-zinc-500'}`} data-testid="pro-mode-toggle">PRO</button>
              <button onClick={handleMtfToggle} className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${mtfEnabled ? 'bg-[#007AFF] text-white' : 'text-zinc-500'}`} data-testid="mtf-toggle">MTF</button>
            </>
          )}
          <button
            onClick={handleToggle}
            className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-[#00E676]' : 'bg-zinc-700'}`}
            data-testid="golden-setup-toggle"
          >
            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {enabled && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Scanning {proMode ? 'Pro (SMC)' : 'EMA'}...</p>}

      {enabled && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="px-1.5 py-0.5 font-bold uppercase tracking-wider border border-white/10 text-zinc-300">{analysis.mode}</span>
            {analysis.adx_value != null && (
              <span className={`font-mono ${analysis.adx_value > 20 ? 'text-[#00E676]' : 'text-zinc-500'}`}>ADX:{analysis.adx_value}</span>
            )}
            {analysis.risk_reward && <span className="font-mono text-zinc-500">RR:{analysis.risk_reward}</span>}
          </div>

          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          {analysis.conditions && (
            <div className="space-y-0.5">
              {Object.entries(analysis.conditions).map(([key, cond]) => (
                <div key={key} className="flex justify-between text-[10px] py-0.5 border-b border-white/5">
                  <span className="text-zinc-500 truncate flex-1">{cond.detail}</span>
                  <span className={cond.met ? 'text-[#00E676] font-mono ml-1' : 'text-zinc-600 font-mono ml-1'}>{cond.met ? 'Y' : 'N'}</span>
                </div>
              ))}
            </div>
          )}

          {analysis.mtf_confirmation && (
            <div className="p-2 border border-white/10 text-[10px]">
              <span className="text-zinc-500">MTF: </span>
              <span className={analysis.mtf_confirmation.confirmed ? 'text-[#00E676]' : 'text-[#FF3B30]'}>
                {analysis.mtf_confirmation.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}
              </span>
              <p className="text-zinc-500 mt-0.5">{analysis.mtf_confirmation.detail}</p>
            </div>
          )}

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!enabled && <p className="text-[10px] text-zinc-600">EMA + ADX | Pro: SMC Sweep + BOS</p>}
    </div>
  );
};

export default GoldenSetupAnalysis;
