import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Lightning, TrendUp, TrendDown, CheckCircle, XCircle, WarningCircle, Crosshair } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PhaseCard = ({ phase }) => {
  const icon = phase.status === 'PASS'
    ? <CheckCircle size={12} weight="fill" className="text-emerald-400" />
    : phase.status === 'PARTIAL'
    ? <WarningCircle size={12} weight="fill" className="text-yellow-400" />
    : <XCircle size={12} weight="fill" className="text-red-400" />;
  const bg = phase.status === 'PASS' ? 'bg-emerald-500/5 border-emerald-500/20'
    : phase.status === 'PARTIAL' ? 'bg-yellow-500/5 border-yellow-500/20'
    : 'bg-red-500/5 border-red-500/20';

  return (
    <div className={`border rounded p-2 ${bg}`} data-testid={`smc-phase-${phase.phase}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-[9px] font-bold text-zinc-300">Phase {phase.phase}: {phase.name}</span>
        <span className={`text-[8px] ml-auto font-bold ${
          phase.status === 'PASS' ? 'text-emerald-400' : phase.status === 'PARTIAL' ? 'text-yellow-400' : 'text-red-400'
        }`}>{phase.status}</span>
      </div>
      <p className="text-[9px] text-zinc-500 leading-relaxed">{phase.detail}</p>
    </div>
  );
};

const SMCAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    if (!stockData?.bars?.length) { toast.error('No data loaded'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/smc/analyze`, {
        ticker: selectedStock?.ticker || selectedStock?.coin_id || 'UNKNOWN',
        bars: stockData.bars.slice(-80),
        timeframe: '15M',
      });
      setResult(data);
      if (data.signal_type !== 'WAIT') {
        toast.success(`SMC ${data.signal_type} Signal — ${data.daily_bias} Bias`);
      }
      
      // Automatically send to chart overlay (no toggle)
      if (onAnalysisComplete) {
        onAnalysisComplete('smc', data);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'SMC Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const isBuy = result?.signal_type === 'BUY';
  const isSell = result?.signal_type === 'SELL';
  const hasSignal = isBuy || isSell;

  return (
    <div className="p-3" data-testid="smc-analysis">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crosshair size={14} className="text-[#00E676]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">SMC Analysis</span>
        </div>
        <button onClick={runAnalysis} disabled={loading || !stockData}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#00E676]/20 text-[#00E676] rounded hover:bg-[#00E676]/30 disabled:opacity-40 transition-colors"
          data-testid="smc-run-btn">
          {loading ? 'Scanning...' : 'RUN SMC'}
        </button>
      </div>

      {!result && !loading && (
        <div className="text-center py-3">
          <p className="text-[10px] text-zinc-500">Smart Money Concepts — 5-Phase Analysis</p>
          <p className="text-[9px] text-zinc-600 mt-1">Liquidity Sweep + MSS + IFVG + Precision Entry</p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {/* Signal Banner */}
          {hasSignal ? (
            <div className={`rounded-lg p-2.5 ${isBuy ? 'bg-[#00E676]/10 border border-[#00E676]/30' : 'bg-[#FF3B30]/10 border border-[#FF3B30]/30'}`}
              data-testid="smc-signal-banner">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {isBuy ? <TrendUp size={16} weight="bold" className="text-[#00E676]" /> : <TrendDown size={16} weight="bold" className="text-[#FF3B30]" />}
                  <span className={`text-sm font-black ${isBuy ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                    {result.signal_type} SIGNAL
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">Conf: {result.confidence}%</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="bg-black/30 rounded p-1.5">
                  <span className="text-zinc-500 block text-[8px]">ENTRY</span>
                  <span className="text-white font-mono font-bold">{result.entry_price}</span>
                </div>
                <div className="bg-black/30 rounded p-1.5">
                  <span className="text-zinc-500 block text-[8px]">STOPLOSS</span>
                  <span className="text-red-400 font-mono font-bold">{result.stop_loss}</span>
                </div>
                <div className="bg-black/30 rounded p-1.5">
                  <span className="text-zinc-500 block text-[8px]">TP1 (1:1)</span>
                  <span className="text-emerald-400 font-mono font-bold">{result.tp1}</span>
                </div>
                <div className="bg-black/30 rounded p-1.5">
                  <span className="text-zinc-500 block text-[8px]">TP2 (1:2.5)</span>
                  <span className="text-emerald-400 font-mono font-bold">{result.tp2}</span>
                </div>
              </div>
              {result.risk_reward && (
                <div className="flex items-center gap-2 mt-1.5 text-[9px]">
                  <span className="text-zinc-500">R:R</span>
                  <span className="text-white font-mono font-bold">{result.risk_reward}</span>
                  {result.atr_value && (
                    <>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-500">ATR(14)</span>
                      <span className="text-white font-mono">{result.atr_value}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center" data-testid="smc-wait-banner">
              <span className="text-xs text-zinc-400 font-bold">WAIT — Setup forming</span>
              <p className="text-[9px] text-zinc-600 mt-0.5">Watching for all 5 phases to align</p>
            </div>
          )}

          {/* Key Info Tags */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
              result.daily_bias === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' :
              result.daily_bias === 'BEARISH' ? 'bg-red-500/10 text-red-400' :
              'bg-zinc-500/10 text-zinc-400'
            }`}>
              Bias: {result.daily_bias}
            </span>
            <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
              result.liquidity_sweep.includes('SWEPT') ? 'bg-purple-500/10 text-purple-400' :
              result.liquidity_sweep.includes('NEAR') ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-zinc-500/10 text-zinc-400'
            }`}>
              {result.liquidity_sweep.replace('_', ' ')}
            </span>
            {result.mss_detected && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-blue-500/10 text-blue-400">
                MSS Detected
              </span>
            )}
            {result.ifvg_zone && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-cyan-500/10 text-cyan-400">
                IFVG: {result.ifvg_zone}
              </span>
            )}
            {result.rejection_quality && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                result.rejection_quality === 'STRONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'
              }`}>
                Wick: {result.rejection_quality}
              </span>
            )}
            {result.volume_confirmed && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400">
                Vol Confirmed
              </span>
            )}
          </div>

          {/* 5 Phases */}
          <div className="space-y-1.5" data-testid="smc-phases">
            {result.phases?.map((p, idx) => (
              <PhaseCard key={idx} phase={p} />
            ))}
          </div>

          {/* Recommendation */}
          <div className="bg-white/5 rounded p-2 mt-1">
            <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Recommendation</span>
            <p className="text-[10px] text-zinc-300 font-mono">{result.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SMCAnalysis;
