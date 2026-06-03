import React, { useState } from 'react';
import axios from 'axios';
import { Crosshair, ArrowFatUp, ArrowFatDown } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GodzillaSetupAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [enabled, setEnabled] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/godzilla-setup/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars
      });
      setAnalysis(response.data);
      if (onAnalysisComplete) onAnalysisComplete('godzilla', response.data);
      toast.success('Godzilla Setup analysis complete!');
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
      if (onAnalysisComplete) onAnalysisComplete(null, null);
  };

  return (
    <div className="p-3" data-testid="godzilla-setup">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Crosshair size={14} className="text-[#FF0055]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Godzilla</span>
        </div>
        <button
          onClick={handleToggle}
          className={`w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-[#00E676]' : 'bg-zinc-700'}`}
          data-testid="godzilla-toggle"
        >
          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Scanning Ross Hooks...</p>}

      {enabled && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          <div className="flex items-center gap-2 text-[10px]">
            {analysis.trend_direction === 'UP' ? <ArrowFatUp size={14} className="text-[#00E676]" weight="fill" /> : <ArrowFatDown size={14} className="text-[#FF3B30]" weight="fill" />}
            <span className="font-bold" style={{ color: analysis.trend_direction === 'UP' ? '#00E676' : analysis.trend_direction === 'DOWN' ? '#FF3B30' : '#888' }}>
              {analysis.trend_direction}
            </span>
            {analysis.hook_detected && <span className="font-mono text-zinc-400">Hook:{analysis.hook_price}</span>}
            <span className="text-zinc-500">Bars:{analysis.correction_bars}/3</span>
          </div>

          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          {analysis.risk_management && (
            <div className="text-[10px] space-y-0.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Risk Mgmt (TTE)</p>
              <div className="flex justify-between py-0.5 border-b border-white/5"><span className="text-zinc-500">T1 Cover</span><span className="font-mono text-white">{analysis.risk_management.partial_exit}</span></div>
              <div className="flex justify-between py-0.5 border-b border-white/5"><span className="text-zinc-500">Hook Test</span><span className="font-mono text-white">{analysis.risk_management.hook_target}</span></div>
            </div>
          )}

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

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!enabled && <p className="text-[10px] text-zinc-600">Ross Hook + TTE</p>}
    </div>
  );
};

export default GodzillaSetupAnalysis;
