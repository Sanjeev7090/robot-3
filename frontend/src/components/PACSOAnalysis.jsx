import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Stack, TrendUp, TrendDown, CheckCircle, XCircle, WarningCircle, ShieldCheck, ArrowsClockwise } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ModuleCard = ({ mod }) => {
  const icon = mod.status === 'PASS'
    ? <CheckCircle size={12} weight="fill" className="text-emerald-400" />
    : mod.status === 'PARTIAL'
    ? <WarningCircle size={12} weight="fill" className="text-yellow-400" />
    : <XCircle size={12} weight="fill" className="text-red-400" />;
  const bg = mod.status === 'PASS' ? 'bg-emerald-500/5 border-emerald-500/20'
    : mod.status === 'PARTIAL' ? 'bg-yellow-500/5 border-yellow-500/20'
    : 'bg-red-500/5 border-red-500/20';

  return (
    <div className={`border rounded p-2 ${bg}`} data-testid={`pacso-module-${mod.module.split(' ')[0].toLowerCase()}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-[9px] font-bold text-zinc-300 flex-1">{mod.module}</span>
        <span className={`text-[8px] ml-auto font-bold ${
          mod.status === 'PASS' ? 'text-emerald-400' : mod.status === 'PARTIAL' ? 'text-yellow-400' : 'text-red-400'
        }`}>{mod.status}</span>
      </div>
      <p className="text-[9px] text-zinc-500 leading-relaxed">{mod.detail}</p>
      {mod.sub_signals?.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {mod.sub_signals.map((s, i) => (
            <p key={i} className="text-[8px] text-zinc-400 pl-2 border-l border-white/10">{s}</p>
          ))}
        </div>
      )}
    </div>
  );
};

const PACSOAnalysis = ({ stockData, selectedStock }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    if (!stockData?.bars?.length) { toast.error('No data loaded'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/pac-so/analyze`, {
        ticker: selectedStock?.ticker || selectedStock?.coin_id || 'UNKNOWN',
        bars: stockData.bars.slice(-80),
        timeframe: '15M',
      });
      setResult(data);
      if (data.signal_type !== 'WAIT') {
        toast.success(`PAC+S&O ${data.signal_type} Signal — ${data.structure_bias} | Confluence: ${data.confluence_score}%`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'PAC+S&O Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const isBuy = result?.signal_type === 'BUY';
  const isSell = result?.signal_type === 'SELL';
  const hasSignal = isBuy || isSell;

  return (
    <div className="p-3" data-testid="pacso-analysis">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Stack size={14} className="text-[#FF6D00]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">PAC + S&O</span>
          <span className="text-[8px] text-zinc-600 font-mono">Matrix</span>
        </div>
        <button onClick={runAnalysis} disabled={loading || !stockData}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#FF6D00]/20 text-[#FF6D00] rounded hover:bg-[#FF6D00]/30 disabled:opacity-40 transition-colors"
          data-testid="pacso-run-btn">
          {loading ? 'Analyzing...' : 'RUN PAC+S&O'}
        </button>
      </div>

      {!result && !loading && (
        <div className="text-center py-3">
          <p className="text-[10px] text-zinc-500">LuxAlgo-Style High Confluence — 3-Module Matrix</p>
          <p className="text-[9px] text-zinc-600 mt-1">PAC (Structure) + S&O (Confirmation) + Oscillator (Momentum)</p>
        </div>
      )}

      {loading && (
        <div className="py-4 text-center animate-pulse space-y-1">
          <ArrowsClockwise size={20} className="text-[#FF6D00] mx-auto animate-spin" weight="bold" />
          <p className="text-[10px] text-[#FF6D00] font-mono">Scanning confluence...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-2">
          {/* Signal Banner */}
          {hasSignal ? (
            <div className={`rounded p-2.5 ${isBuy ? 'bg-[#00E676]/10 border border-[#00E676]/30' : 'bg-[#FF3B30]/10 border border-[#FF3B30]/30'}`}
              data-testid="pacso-signal-banner">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {isBuy ? <TrendUp size={16} weight="bold" className="text-[#00E676]" /> : <TrendDown size={16} weight="bold" className="text-[#FF3B30]" />}
                  <span className={`text-sm font-black ${isBuy ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                    {result.signal_type} SIGNAL
                  </span>
                  {result.signal_strength && (
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                      result.signal_strength === 'STRONG+' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-zinc-400'
                    }`}>{result.signal_strength}</span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">Conf: {result.confluence_score}%</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="bg-black/30 rounded p-1.5">
                  <span className="text-zinc-500 block text-[8px]">ENTRY</span>
                  <span className="text-white font-mono font-bold" data-testid="pacso-entry">{result.entry_price}</span>
                </div>
                <div className="bg-black/30 rounded p-1.5">
                  <span className="text-zinc-500 block text-[8px]">STOPLOSS</span>
                  <span className="text-red-400 font-mono font-bold" data-testid="pacso-sl">{result.stop_loss}</span>
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
              {result.tp3 && (
                <div className="mt-1.5 bg-black/30 rounded p-1.5 text-[10px]">
                  <span className="text-zinc-500 text-[8px]">TP3 (1:3.5)</span>
                  <span className="text-emerald-400 font-mono font-bold ml-2">{result.tp3}</span>
                </div>
              )}
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
                  {result.smart_trail_level && (
                    <>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-500">Trail</span>
                      <span className="text-[#FF6D00] font-mono">{result.smart_trail_level}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded p-2.5 text-center" data-testid="pacso-wait-banner">
              <span className="text-xs text-zinc-400 font-bold">WAIT — Confluence: {result.confluence_score}/100</span>
              <p className="text-[9px] text-zinc-600 mt-0.5">Need PAC + S&O + Oscillator all aligned</p>
            </div>
          )}

          {/* Key Tags */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
              result.structure_bias === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' :
              result.structure_bias === 'BEARISH' ? 'bg-red-500/10 text-red-400' :
              'bg-zinc-500/10 text-zinc-400'
            }`} data-testid="pacso-bias">
              {result.structure_bias}
            </span>
            {result.bos_detected && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-blue-500/10 text-blue-400">BOS</span>
            )}
            {result.choch_detected && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${result.choch_plus ? 'bg-purple-500/10 text-purple-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                CHoCH{result.choch_plus ? '+' : ''}
              </span>
            )}
            {result.liquidity_swept && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-purple-500/10 text-purple-400">Liq Swept</span>
            )}
            <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
              result.premium_discount === 'DISCOUNT' ? 'bg-emerald-500/10 text-emerald-400' :
              result.premium_discount === 'PREMIUM' ? 'bg-red-500/10 text-red-400' :
              'bg-zinc-500/10 text-zinc-400'
            }`}>
              {result.premium_discount}
            </span>
            {result.order_block_zone && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-orange-500/10 text-orange-400">
                OB: {result.order_block_zone}
              </span>
            )}
            {result.fvg_zone && (
              <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-cyan-500/10 text-cyan-400">
                FVG: {result.fvg_zone}
              </span>
            )}
            {result.neo_cloud_trend && result.neo_cloud_trend !== 'NEUTRAL' && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                result.neo_cloud_trend === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                Cloud: {result.neo_cloud_trend}
              </span>
            )}
            {result.money_flow && result.money_flow !== 'NEUTRAL' && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                result.money_flow === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                Flow: {result.money_flow}
              </span>
            )}
            {result.divergence && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                result.divergence.includes('Bullish') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {result.divergence}
              </span>
            )}
            {result.momentum_state && (
              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                result.momentum_state === 'STRONG' ? 'bg-emerald-500/10 text-emerald-400' :
                result.momentum_state === 'OVERBOUGHT' ? 'bg-red-500/10 text-red-400' :
                result.momentum_state === 'OVERSOLD' ? 'bg-yellow-500/10 text-yellow-400' :
                'bg-zinc-500/10 text-zinc-400'
              }`}>
                {result.momentum_state}
              </span>
            )}
          </div>

          {/* 3 Modules */}
          <div className="space-y-1.5" data-testid="pacso-modules">
            {result.modules?.map((m, idx) => (
              <ModuleCard key={idx} mod={m} />
            ))}
          </div>

          {/* Recommendation */}
          <div className="bg-[#FF6D00]/5 border border-[#FF6D00]/20 rounded p-2 mt-1">
            <span className="text-[8px] text-zinc-500 uppercase block mb-0.5">Recommendation</span>
            <p className="text-[10px] text-zinc-300 font-mono leading-relaxed" data-testid="pacso-recommendation">{result.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PACSOAnalysis;
