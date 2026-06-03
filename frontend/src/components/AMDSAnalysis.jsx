import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Lightning, TrendUp, TrendDown, CheckCircle, XCircle, WarningCircle, Gauge } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StepCard = ({ step }) => {
  const icon = step.status === 'PASS'
    ? <CheckCircle size={12} weight="fill" className="text-emerald-400" />
    : step.status === 'PARTIAL'
    ? <WarningCircle size={12} weight="fill" className="text-yellow-400" />
    : <XCircle size={12} weight="fill" className="text-red-400" />;
  const bg = step.status === 'PASS' ? 'bg-emerald-500/5 border-emerald-500/20'
    : step.status === 'PARTIAL' ? 'bg-yellow-500/5 border-yellow-500/20'
    : 'bg-red-500/5 border-red-500/20';

  return (
    <div className={`border rounded p-2 ${bg}`} data-testid={`amds-step-${step.step}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-[9px] font-bold text-zinc-300">Step {step.step}: {step.name}</span>
        <span className={`text-[8px] ml-auto font-bold ${
          step.status === 'PASS' ? 'text-emerald-400' : step.status === 'PARTIAL' ? 'text-yellow-400' : 'text-red-400'
        }`}>{step.status}</span>
      </div>
      <p className="text-[9px] text-zinc-500 leading-relaxed">{step.detail}</p>
    </div>
  );
};

const AMDSAnalysis = ({ stockData, selectedStock, onAnalysisComplete }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    if (!stockData?.bars?.length) { toast.error('No data loaded'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/amds/analyze`, {
        ticker: selectedStock?.ticker || selectedStock?.coin_id || 'UNKNOWN',
        bars: stockData.bars.slice(-100),
        timeframe: '15M',
      });
      setResult(data);
      if (data.signal_type !== 'WAIT') {
        toast.success(`AMDS ${data.signal_type} Signal — ${data.htf_bias} Bias | Score: ${data.composite_score}`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AMDS Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const isBuy = result?.signal_type === 'BUY';
  const isSell = result?.signal_type === 'SELL';
  const hasSignal = isBuy || isSell;

  return (
    <div className="p-3" data-testid="amds-analysis">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightning size={14} className="text-cyan-400" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">AMDS-Hybrid</span>
        </div>
        <button onClick={runAnalysis} disabled={loading || !stockData}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
          data-testid="amds-run-btn">
          {loading ? 'Scanning...' : 'RUN AMDS'}
        </button>
      </div>

      {!result && !loading && (
        <div className="text-center py-3">
          <p className="text-[10px] text-zinc-500">Adaptive Momentum + Smart Money — 6-Step</p>
          <p className="text-[9px] text-zinc-600 mt-1">EMA200 Bias + Accumulation + Sweep + CISD + ADX/RSI/OBV</p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {/* Signal Banner */}
          {hasSignal ? (
            <div className={`rounded-lg p-2.5 ${isBuy ? 'bg-[#00E676]/10 border border-[#00E676]/30' : 'bg-[#FF3B30]/10 border border-[#FF3B30]/30'}`}
              data-testid="amds-signal-banner">
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
                  <span className="text-zinc-500 block text-[8px]">TP1 (1:1.5)</span>
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
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500">ATR</span>
                  <span className="text-white font-mono">{result.atr_value}</span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500">Risk</span>
                  <span className="text-white font-mono">0.75-1%</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center" data-testid="amds-wait-banner">
              <span className="text-xs text-zinc-400 font-bold">WAIT — Setup forming</span>
              <p className="text-[9px] text-zinc-600 mt-0.5">AMDS conditions not fully aligned</p>
            </div>
          )}

          {/* Key Info Tags */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
              result.htf_bias === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' :
              result.htf_bias === 'BEARISH' ? 'bg-red-500/10 text-red-400' :
              'bg-zinc-500/10 text-zinc-400'
            }`}>
              EMA200: {result.htf_bias}
            </span>
            {result.accumulation_range && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-zinc-500/10 text-zinc-300">
                Range: {result.accumulation_range}
              </span>
            )}
            {result.manipulation_sweep && result.manipulation_sweep !== 'NONE' && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-purple-500/10 text-purple-400">
                {result.manipulation_sweep.replace('_', ' ')}
              </span>
            )}
            {result.cisd_detected && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-blue-500/10 text-blue-400">CISD</span>
            )}
            {result.bos_detected && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-orange-500/10 text-orange-400">BOS</span>
            )}
          </div>

          {/* AMDS Indicator Bar */}
          <div className="bg-white/5 rounded p-2">
            <div className="flex items-center gap-1 mb-1.5">
              <Gauge size={11} className="text-cyan-400" />
              <span className="text-[9px] font-bold text-zinc-400">AMDS Indicators</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              <div className="text-center">
                <span className="text-[8px] text-zinc-500 block">ADX</span>
                <span className={`font-mono font-bold ${result.adx_value > 28 ? 'text-emerald-400' : result.adx_value > 22 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {result.adx_value}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[8px] text-zinc-500 block">RSI</span>
                <span className={`font-mono font-bold ${result.rsi_value < 35 || result.rsi_value > 65 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {result.rsi_value}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[8px] text-zinc-500 block">OBV</span>
                <span className={`font-mono font-bold ${
                  result.obv_trend === 'RISING' ? 'text-emerald-400' : result.obv_trend === 'FALLING' ? 'text-red-400' : 'text-zinc-400'
                }`}>
                  {result.obv_trend}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[8px] text-zinc-500 block">Score</span>
                <span className={`font-mono font-bold ${result.composite_score >= 88 ? 'text-emerald-400' : result.composite_score >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {result.composite_score}
                </span>
              </div>
            </div>
          </div>

          {/* 6 Steps */}
          <div className="space-y-1.5" data-testid="amds-steps">
            {result.steps?.map((s, idx) => (
              <StepCard key={idx} step={s} />
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

export default AMDSAnalysis;
