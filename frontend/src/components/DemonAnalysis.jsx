import React, { useState } from 'react';
import axios from 'axios';
import { Flame } from '@phosphor-icons/react';
import { toast } from 'sonner';
import SignalIndicator from './SignalIndicator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const signalColor = (sig) => sig === 'BUY' ? '#00E676' : sig === 'SELL' ? '#FF3B30' : '#52525B';

const DemonAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [enabled, setEnabled] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!stockData || !selectedStock) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/demon/analyze`, {
        ticker: selectedStock.ticker, bars: stockData.bars
      });
      setAnalysis(response.data);
      toast.success('DEMON analysis complete!');
      
      // Automatically send to chart (no toggle)
      if (onAnalysisComplete) {
        onAnalysisComplete('demon', response.data);
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
    else setAnalysis(null);
      if (onAnalysisComplete) onAnalysisComplete(null, null);
  };

  const getVerdictColor = (v) => {
    if (v === 'DEMON BUY') return '#00E676';
    if (v === 'DEMON SELL') return '#FF3B30';
    if (v === 'LEANING BUY') return '#88FF88';
    if (v === 'LEANING SELL') return '#FF8888';
    if (v === 'MIXED') return '#F5A623';
    return '#888';
  };

  return (
    <div className="p-3" data-testid="demon-analysis">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-[#007AFF]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">DEMON</span>
          <span className="text-[8px] text-zinc-600">7-Strategy</span>
        </div>
        <button
          onClick={handleToggle}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
            enabled 
              ? 'bg-[#00E676]/20 text-[#00E676] hover:bg-[#00E676]/30' 
              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
          }`}
          data-testid="demon-toggle"
        >
          {loading ? 'Running...' : enabled ? 'STOP' : 'RUN DEMON'}
        </button>
      </div>

      {enabled && loading && <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Running 7 strategies...</p>}

      {enabled && analysis && !loading && (
        <div className="animate-fade-in space-y-2">
          {/* Verdict */}
          <div className="text-center py-2 border border-white/10" style={{ borderColor: getVerdictColor(analysis.verdict) + '40' }}>
            <p className="text-lg font-black uppercase tracking-tight" style={{ color: getVerdictColor(analysis.verdict), fontFamily: "'Chivo', sans-serif" }} data-testid="demon-verdict">
              {analysis.verdict}
            </p>
            <p className="text-[10px] text-zinc-500 font-mono">
              {analysis.confidence}% | {analysis.buy_count}B {analysis.sell_count}S {analysis.wait_count}W
            </p>
          </div>

          <SignalIndicator signalType={analysis.signal_type} entryPrice={analysis.entry_price} stopLoss={analysis.stop_loss} targets={analysis.targets} />

          {/* Strategy Grid */}
          <div className="grid grid-cols-2 gap-0.5">
            {Object.entries(analysis.strategy_signals).map(([key, s]) => (
              <div key={key} className="flex items-center justify-between py-1 px-1.5 border border-white/5 text-[9px]">
                <span className="text-zinc-500 truncate">{s.name.replace(/\s*\(.*\)/, '')}</span>
                <span className="font-mono font-bold" style={{ color: signalColor(s.signal) }}>{s.signal}</span>
              </div>
            ))}
          </div>

          {/* Confluence Meter */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Confluence</p>
            <div className="flex h-2 overflow-hidden">
              {analysis.buy_count > 0 && <div className="bg-[#00E676]" style={{ width: `${(analysis.buy_count / analysis.total_strategies) * 100}%` }} />}
              {analysis.wait_count > 0 && <div className="bg-zinc-600" style={{ width: `${(analysis.wait_count / analysis.total_strategies) * 100}%` }} />}
              {analysis.sell_count > 0 && <div className="bg-[#FF3B30]" style={{ width: `${(analysis.sell_count / analysis.total_strategies) * 100}%` }} />}
            </div>
          </div>

          <div className="p-2 bg-white/5 border border-white/5">
            <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.recommendation}</p>
          </div>
        </div>
      )}

      {!enabled && <p className="text-[10px] text-zinc-600">4+ agree = DEMON signal | 3 = Leaning</p>}
    </div>
  );
};

export default DemonAnalysis;
