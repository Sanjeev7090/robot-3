import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n, dec = 0) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(n);

const fmtInr = (n) =>
  n == null ? '—' : `₹${fmt(n, 0)}`;

const fmtPct = (n, dec = 2) =>
  n == null ? '—' : `${Number(n).toFixed(dec)}%`;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ─── Color helpers ────────────────────────────────────────────────────────────
const SIGNAL_COLORS = {
  BUY:  { bg: '#10b981', text: '#ecfdf5', icon: '▲' },
  SELL: { bg: '#ef4444', text: '#fef2f2', icon: '▼' },
  HOLD: { bg: '#6b7280', text: '#f9fafb', icon: '●' },
};

const STATUS_MAP = {
  idle:            { label: 'Idle',            color: '#6b7280', pulse: false },
  scanning:        { label: 'Scanning…',        color: '#3b82f6', pulse: true  },
  trading:         { label: 'Trading',          color: '#10b981', pulse: true  },
  paused:          { label: 'Paused',           color: '#f59e0b', pulse: false },
  circuit_breaker: { label: 'Circuit Breaker',  color: '#ef4444', pulse: false },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FeasibilityGauge({ score = 50, label = '', color = '#f59e0b' }) {
  const angle = clamp((score / 100) * 180, 0, 180);
  const rad   = (angle - 90) * (Math.PI / 180);
  const cx = 60, cy = 60, r = 48;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);
  const arcEnd = (pct) => {
    const a = (pct * 180 - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [bx, by] = arcEnd(0);
  const [ex, ey] = arcEnd(1);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-32 h-20">
        {/* Track arc */}
        <path
          d={`M${bx},${by} A${r},${r} 0 0 1 ${ex},${ey}`}
          fill="none" stroke="#374151" strokeWidth="12" strokeLinecap="round"
        />
        {/* Fill arc */}
        {score > 0 && (
          <path
            d={`M${bx},${by} A${r},${r} 0 0 1 ${nx},${ny}`}
            fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          />
        )}
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={cx + (r - 8) * Math.cos(rad)}
          y2={cy + (r - 8) * Math.sin(rad)}
          stroke="white" strokeWidth="2.5" strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="4" fill="white" />
        <text x={cx} y={cy + 20} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">
          {score}
        </text>
      </svg>
      <span className="text-xs font-semibold mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

function ProgressBar({ current, target, label }) {
  const pct    = target > 0 ? clamp((current / target) * 100, -100, 200) : 0;
  const pctVis = clamp(Math.abs(pct), 0, 100);
  const isNeg  = current < 0;
  const color  = isNeg ? '#ef4444' : pct >= 100 ? '#10b981' : '#3b82f6';
  return (
    <div className="w-full">
      {label && <p className="text-xs text-zinc-400 mb-1">{label}</p>}
      <div className="relative h-4 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pctVis}%`, background: color }}
        />
        <span
          className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ textShadow: '0 1px 2px #000' }}
        >
          {fmtPct(pct, 0)} of daily target
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = '#a1a1aa', icon }) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/40 rounded-xl p-3 flex flex-col gap-1">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
        {icon && <span>{icon}</span>}
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function TradeRow({ trade, index }) {
  const isPnlPos = (trade.pnl || 0) >= 0;
  return (
    <div
      className={`flex items-center gap-2 py-2 px-3 rounded-lg border ${
        index % 2 === 0 ? 'bg-zinc-800/30' : 'bg-zinc-800/10'
      } border-zinc-700/20`}
    >
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded"
        style={{
          background: trade.direction === 'BUY' ? '#10b98133' : '#ef444433',
          color: trade.direction === 'BUY' ? '#10b981' : '#ef4444',
        }}
      >
        {trade.direction}
      </span>
      <span className="text-zinc-300 text-xs font-mono flex-1 min-w-0 truncate">{trade.ticker}</span>
      <span className="text-zinc-400 text-[10px]">#{trade.trade_id}</span>
      <span className="text-zinc-400 text-[10px]">@ ₹{fmt(trade.entry_price, 0)}</span>
      <span className={`text-xs font-semibold ml-auto ${isPnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPnlPos ? '+' : ''}₹{fmt(trade.pnl, 0)}
      </span>
      <span className="text-[10px] text-zinc-500">{trade.exit_reason}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RoboDashboard({ selectedStock }) {
  // Settings state
  const [settings, setSettings] = useState({
    daily_profit_target: 1000,
    allocated_capital: 100000,
    ticker: 'RELIANCE.NS',
    risk_tolerance: 'moderate',
  });
  const [editSettings, setEditSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [capitalState, setCapitalState] = useState(null);

  // Robo state
  const [roboState, setRoboState] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditMeta, setAuditMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Sync ticker from parent
  useEffect(() => {
    if (selectedStock?.ticker && selectedStock.type !== 'CRYPTO' && selectedStock.type !== 'OPTION') {
      setSettings(p => ({ ...p, ticker: selectedStock.ticker }));
    }
  }, [selectedStock]);

  // Fetch full state
  const fetchState = useCallback(async () => {
    try {
      const [stRes, auditRes] = await Promise.all([
        axios.get(`${API}/robo/status`),
        axios.get(`${API}/robo/audit?limit=20`),
      ]);
      setRoboState(stRes.data);
      setAudit(auditRes.data.trades || []);
      setAuditMeta({
        total_pnl: auditRes.data.total_pnl,
        win_count: auditRes.data.win_count,
        loss_count: auditRes.data.loss_count,
        win_rate: auditRes.data.win_rate,
      });
      // Sync settings from robo state
      if (stRes.data) {
        setSettings({
          daily_profit_target: stRes.data.daily_profit_target || 1000,
          allocated_capital:   stRes.data.allocated_capital   || 100000,
          ticker:              stRes.data.ticker              || 'RELIANCE.NS',
          risk_tolerance:      stRes.data.risk_tolerance      || 'moderate',
        });
        if (stRes.data.capital_state_vector) setCapitalState(stRes.data.capital_state_vector);
      }
    } catch (e) {
      /* silent */
    }
  }, []);

  // Polling
  useEffect(() => {
    fetchState();
    pollRef.current = setInterval(fetchState, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchState]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenSettings = () => {
    setEditSettings({ ...settings });
    setPreview(null);
    setSettingsOpen(true);
  };

  const handlePreview = async () => {
    if (!editSettings) return;
    setPreviewLoading(true);
    try {
      const res = await axios.post(`${API}/robo/risk-preview`, {
        daily_profit_target: Number(editSettings.daily_profit_target),
        allocated_capital:   Number(editSettings.allocated_capital),
        risk_tolerance:      editSettings.risk_tolerance,
      });
      setPreview(res.data.preview);
    } catch (e) {
      setError('Preview failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!editSettings) return;
    setLoading(true);
    try {
      await axios.post(`${API}/robo/settings`, {
        daily_profit_target: Number(editSettings.daily_profit_target),
        allocated_capital:   Number(editSettings.allocated_capital),
        ticker:              editSettings.ticker,
        risk_tolerance:      editSettings.risk_tolerance,
      });
      setSettingsOpen(false);
      await fetchState();
    } catch (e) {
      setError('Save failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    try {
      await axios.post(`${API}/robo/recalculate`, { trigger: 'manual' });
      await fetchState();
    } catch (e) {
      setError('Recalculate failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleToggleAuto = async () => {
    const isActive = roboState?.auto_mode;
    setLoading(true);
    try {
      if (isActive) {
        await axios.post(`${API}/robo/stop`);
      } else {
        await axios.post(`${API}/robo/start`, { ticker: settings.ticker });
      }
      await fetchState();
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDaily = async () => {
    try {
      await axios.post(`${API}/robo/reset-daily`);
      await fetchState();
    } catch (e) { /* silent */ }
  };

  // ─── Derived state ─────────────────────────────────────────────────────────

  const rs     = roboState;
  const rp     = rs?.risk_profile || {};
  const dec    = rs?.current_decision;
  const status = rs?.status || 'idle';
  const statusCfg = STATUS_MAP[status] || STATUS_MAP.idle;
  const isActive = rs?.auto_mode;
  const dailyPnl = rs?.daily_pnl || 0;
  const openTrade = rs?.open_trade;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white font-sans">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-[#0d0d0f]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-sm font-bold">
              🤖
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Dreamer V3 Robo-Trader</h1>
              <p className="text-[10px] text-zinc-500">Institutional-Grade Autonomous System · PAPER MODE</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${statusCfg.pulse ? 'animate-pulse' : ''}`}
              style={{ borderColor: statusCfg.color + '40', background: statusCfg.color + '15', color: statusCfg.color }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusCfg.color }} />
              {statusCfg.label}
            </div>
            <button
              onClick={handleOpenSettings}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 transition-colors"
            >
              ⚙ Settings
            </button>
          </div>
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div className="bg-amber-900/20 border-b border-amber-700/30 px-4 py-1.5">
        <p className="text-[10px] text-amber-400 text-center max-w-4xl mx-auto">
          ⚠️ PAPER TRADING ONLY — No real capital at risk. No guaranteed returns. Past performance ≠ future results. Consult a SEBI-registered advisor.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* ── Error ── */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-red-400 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-lg ml-4">×</button>
          </div>
        )}

        {/* ── Circuit Breaker Alert ── */}
        {rs?.circuit_breaker && (
          <div className="bg-red-900/40 border border-red-600/60 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-red-400 text-lg">🔴</span>
              <h3 className="text-red-300 font-bold">Circuit Breaker Tripped</h3>
            </div>
            <p className="text-red-400 text-sm">{rs.circuit_reason}</p>
            <p className="text-red-500 text-xs mt-1">Auto mode paused to protect capital. Review and reset to resume.</p>
          </div>
        )}

        {/* ── Top Row: Target Settings + Feasibility ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Settings Summary Card */}
          <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-white">Trading Parameters</h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">Editable at any time · system recalculates instantly</p>
              </div>
              <button
                onClick={handleOpenSettings}
                className="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs rounded-lg transition-colors"
              >
                Edit Settings
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Daily Target"
                value={fmtInr(rs?.daily_profit_target || settings.daily_profit_target)}
                color="#10b981"
                icon="🎯"
              />
              <StatCard
                label="Allocated Capital"
                value={fmtInr(rs?.allocated_capital || settings.allocated_capital)}
                color="#3b82f6"
                icon="💰"
              />
              <StatCard
                label="Required Daily Return"
                value={fmtPct(rp.required_daily_return_pct)}
                color={rp.feasibility_color || '#f59e0b'}
                icon="📈"
              />
              <StatCard
                label="Risk / Trade"
                value={fmtPct(rp.risk_per_trade_pct, 1)}
                color="#a78bfa"
                sub={`≤ ${rp.max_trades_per_day} trades/day`}
                icon="⚖️"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <StatCard
                label="Position Size"
                value={fmtInr(rp.position_size_inr)}
                color="#f59e0b"
                icon="📊"
              />
              <StatCard
                label="Max Daily Loss"
                value={fmtInr(rp.max_daily_loss_inr)}
                color="#ef4444"
                sub="Circuit breaker level"
                icon="🛡️"
              />
              <StatCard
                label="VaR 1-Day 95%"
                value={fmtInr(rp.var_1day_95)}
                color="#f97316"
                icon="📉"
              />
              <StatCard
                label="Min Win-Rate Needed"
                value={fmtPct(rp.min_winrate_needed, 0)}
                color="#06b6d4"
                sub={`R:R = 1:${rp.recommended_rr}`}
                icon="🏆"
              />
            </div>
          </div>

          {/* Feasibility Gauge */}
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4 flex flex-col items-center justify-between">
            <h2 className="text-sm font-bold text-white self-start">Feasibility Score</h2>
            <FeasibilityGauge
              score={rp.feasibility_score || 0}
              label={rp.feasibility_label || 'Not computed'}
              color={rp.feasibility_color || '#6b7280'}
            />
            <div className="w-full mt-2 space-y-1 text-[10px]">
              {[
                ['< 0.2%/day', '#10b981', 'Easily Achievable'],
                ['0.2–0.5%',   '#84cc16', 'Achievable'],
                ['0.5–1%',     '#f59e0b', 'Moderate'],
                ['1–2%',       '#f97316', 'Aggressive'],
                ['> 2%',       '#ef4444', 'Unrealistic'],
              ].map(([range, color, lbl]) => (
                <div key={lbl} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-zinc-500">{range}</span>
                  <span className="ml-auto font-medium" style={{ color }}>{lbl}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Daily Progress ── */}
        <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Daily Progress</h2>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold ${dailyPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {dailyPnl >= 0 ? '+' : ''}{fmtInr(dailyPnl)}
              </span>
              <span className="text-zinc-500 text-sm">of {fmtInr(rs?.daily_profit_target)}</span>
            </div>
          </div>
          <ProgressBar
            current={dailyPnl}
            target={rs?.daily_profit_target || 1}
          />
          <div className="grid grid-cols-4 gap-3 mt-3">
            <StatCard label="Trades Today" value={rs?.daily_trades || 0} color="#a1a1aa" icon="🔄" />
            <StatCard label="Win / Loss" value={`${rs?.win_trades || 0} / ${rs?.loss_trades || 0}`} color="#a1a1aa" icon="📋" />
            <StatCard label="Consec. Losses" value={rs?.consecutive_losses || 0}
              color={(rs?.consecutive_losses || 0) >= 3 ? '#ef4444' : '#a1a1aa'} icon="⚠️" />
            <StatCard label="Capital" value={fmtInr(rs?.current_capital)} color="#3b82f6"
              sub={`Peak: ${fmtInr(rs?.peak_capital)}`} icon="💎" />
          </div>
        </div>

        {/* ── Phase 2: VaR / CVaR + Kelly + Dynamic Budget ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* VaR / CVaR */}
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white">VaR / CVaR Analysis</h2>
              <span className="text-[10px] text-zinc-500">Parametric Normal</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'VaR 95%',  value: fmtInr(rp.var_95_inr),  sub: fmtPct(rp.var_95_pct_of_capital) + ' of capital', color: '#f59e0b' },
                { label: 'VaR 99%',  value: fmtInr(rp.var_99_inr),  sub: fmtPct(rp.var_99_pct_of_capital) + ' of capital', color: '#f97316' },
                { label: 'CVaR 95%', value: fmtInr(rp.cvar_95_inr), sub: 'Expected shortfall',                              color: '#ef4444' },
                { label: 'CVaR 99%', value: fmtInr(rp.cvar_99_inr), sub: 'Tail risk',                                       color: '#dc2626' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-zinc-800/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
                  <p className="text-sm font-bold" style={{ color }}>{value}</p>
                  <p className="text-[9px] text-zinc-600">{sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-zinc-500 space-y-1">
              <p>VaR = max 1-day loss at confidence level</p>
              <p>CVaR = expected loss <em>given</em> VaR is breached</p>
            </div>
          </div>

          {/* Kelly + Volatility Regime */}
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">Kelly Position Sizing</h2>
            <div className="space-y-2">
              {[
                { label: 'Kelly Fraction',   value: fmtPct(rp.kelly_fraction * 100, 3),  color: '#a78bfa' },
                { label: 'Kelly Position',   value: fmtInr(rp.kelly_position_inr),        color: '#8b5cf6' },
                { label: 'ATR Position',     value: fmtInr(rp.atr_position_inr || rp.position_size_inr), color: '#3b82f6' },
                { label: 'Final (min)',       value: fmtInr(rp.position_size_inr),         color: '#10b981' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-1 border-b border-zinc-800">
                  <span className="text-[11px] text-zinc-400">{label}</span>
                  <span className="text-[11px] font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div
                className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center"
                style={{
                  background: rp.vol_regime === 'HIGH' ? '#ef444420' : rp.vol_regime === 'LOW' ? '#10b98120' : '#3b82f620',
                  color: rp.vol_regime === 'HIGH' ? '#ef4444' : rp.vol_regime === 'LOW' ? '#10b981' : '#3b82f6',
                  border: `1px solid ${rp.vol_regime === 'HIGH' ? '#ef444440' : rp.vol_regime === 'LOW' ? '#10b98140' : '#3b82f640'}`,
                }}
              >
                {rp.vol_regime || '—'} VOL REGIME
              </div>
              <div className="px-2 py-1.5 bg-zinc-800 rounded-lg text-[10px] text-zinc-400">
                ×{rp.vol_regime_mult || 1}
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">
              Final = min(Kelly, ATR) × vol-regime mult. Conservative bias enforced.
            </p>
          </div>

          {/* Dynamic Budget + Portfolio Heat */}
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">Dynamic Risk Budget</h2>
            {/* Budget state badge */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  background: rp.risk_budget_state === 'STOP' ? '#ef444420'
                    : rp.risk_budget_state === 'REDUCED' ? '#f59e0b20'
                    : rp.risk_budget_state === 'CAUTIOUS' ? '#f97316'+'20'
                    : '#10b98120',
                  color: rp.risk_budget_state === 'STOP' ? '#ef4444'
                    : rp.risk_budget_state === 'REDUCED' ? '#f59e0b'
                    : rp.risk_budget_state === 'CAUTIOUS' ? '#f97316'
                    : '#10b981',
                }}
              >
                {rp.risk_budget_state || 'NORMAL'}
              </div>
              <span className="text-[11px] text-zinc-500">
                ×{rp.risk_budget_multiplier || 1} multiplier
              </span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Remaining Budget', value: fmtInr(rp.risk_budget_remaining), color: '#10b981' },
                { label: 'Max Daily Loss',   value: fmtInr(rp.daily_loss_limit),       color: '#ef4444' },
                { label: 'Portfolio Heat',   value: fmtPct(rp.portfolio_heat_pct, 2),  color: rp.heat_exceeded ? '#ef4444' : '#a1a1aa' },
                { label: 'Heat Limit',       value: fmtPct(rp.max_portfolio_heat_pct, 0), color: '#6b7280' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-1 border-b border-zinc-800">
                  <span className="text-[11px] text-zinc-400">{label}</span>
                  <span className="text-[11px] font-bold" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
            {rp.heat_exceeded && (
              <div className="mt-2 text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1">
                🔴 Portfolio heat exceeded — no new trades until positions close
              </div>
            )}
            <button
              onClick={handleRecalculate}
              disabled={recalcLoading}
              className="w-full mt-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {recalcLoading ? '⟳ Recalculating…' : '↺ Live Recalculate'}
            </button>
          </div>
        </div>

        {/* ── Phase 2: Feasibility Warnings + Historical Context ── */}
        {(rp.feasibility_warnings?.length > 0 || rp.hist_exceedance_pct != null) && (
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white">Feasibility Analysis — NSE Historical Context</h2>
              <span className="text-[10px] text-zinc-500">
                {rp.nse_median_comparison || ''}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-[10px] text-zinc-500 mb-1">% of NSE days that exceed target</p>
                <p className="text-xl font-black" style={{ color: rp.feasibility_color || '#f59e0b' }}>
                  {rp.hist_exceedance_pct != null ? `${rp.hist_exceedance_pct}%` : '—'}
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">historical frequency</p>
              </div>
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-[10px] text-zinc-500 mb-1">Min win-rate to break even</p>
                <p className="text-xl font-black text-blue-400">
                  {rp.required_win_rate_min != null ? `${rp.required_win_rate_min}%` : '—'}
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">at 1:1.5 R:R ratio</p>
              </div>
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-[10px] text-zinc-500 mb-1">Feasibility score</p>
                <p className="text-xl font-black" style={{ color: rp.feasibility_color || '#f59e0b' }}>
                  {rp.feasibility_score ?? '—'} / 100
                </p>
                <p className="text-[10px]" style={{ color: rp.feasibility_color }}>{rp.feasibility_label}</p>
              </div>
            </div>
            {/* Suggestion */}
            {rp.feasibility_suggestion && (
              <p className="text-xs text-zinc-400 bg-zinc-800/40 rounded-lg px-3 py-2 mb-2">
                💡 {rp.feasibility_suggestion}
              </p>
            )}
            {/* Warnings */}
            {rp.feasibility_warnings?.length > 0 && (
              <div className="space-y-1">
                {rp.feasibility_warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-1.5">
                    {w}
                  </div>
                ))}
              </div>
            )}
            {/* Alternative targets */}
            {rp.alternative_targets && Object.keys(rp.alternative_targets).length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] text-zinc-500 mb-1">Realistic alternatives:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rp.alternative_targets).slice(0, 3).map(([label, val]) => (
                    <span key={label} className="text-[10px] px-2 py-1 bg-zinc-800 rounded text-zinc-400">
                      {label.split('(')[0].trim()}: <strong className="text-white">₹{fmt(val, 0)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Phase 2: DreamerV3 Capital State Vector ── */}
        {capitalState && (
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white">DreamerV3 Capital State Vector</h2>
              <span className="text-[10px] text-zinc-500">Normalised inputs to world model</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {Object.entries(capitalState).map(([key, val]) => {
                const pct = Math.abs(val) * 100;
                const isNeg = val < 0;
                const label = key.replace(/_/g, ' ').replace('normalised', 'norm').replace('fraction', 'frac');
                return (
                  <div key={key} className="bg-zinc-800/60 rounded-lg p-2">
                    <p className="text-[9px] text-zinc-500 mb-1 leading-tight">{label}</p>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: isNeg ? '#ef4444' : '#8b5cf6',
                        }}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-center" style={{ color: isNeg ? '#ef4444' : '#a78bfa' }}>
                      {Number(val).toFixed(3)}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">
              These 6 values are appended to the DreamerV3 observation vector every step,
              teaching the world model to optimize for your specific capital and target constraints.
            </p>
          </div>
        )}

        {/* ── Auto Mode Panel + DreamerV3 Decision ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Auto Mode Control */}
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">Auto Mode Control</h2>
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={handleToggleAuto}
                disabled={loading || rs?.circuit_breaker}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                  isActive
                    ? 'bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300'
                    : rs?.circuit_breaker
                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-600 cursor-not-allowed'
                    : 'bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300'
                }`}
              >
                {loading ? '…' : isActive ? '⏹ Stop Auto Mode' : '▶ Start Auto Mode'}
              </button>
              <button
                onClick={handleResetDaily}
                className="px-3 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs transition-colors"
                title="Reset daily counters"
              >
                🔄 Reset Day
              </button>
            </div>
            <div className="space-y-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Paper trading only — no real orders
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> DreamerV3 scans every 60 seconds
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Circuit breaker at{' '}
                <span className="text-amber-400">{fmtInr(rp.max_daily_loss_inr)} loss</span> or 5% drawdown
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400">ℹ</span> Requires DreamerV3 training (RL Agent tab)
              </div>
            </div>
            {dec?.dreamer_active === false && (
              <div className="mt-3 bg-amber-900/20 border border-amber-700/30 rounded-lg p-2 text-xs text-amber-400">
                ⚡ DreamerV3 not active. Go to <strong>RL Agent</strong> tab → Start Training first.
              </div>
            )}
          </div>

          {/* Current DreamerV3 Decision */}
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white">DreamerV3 Decision</h2>
              {dec?.timestamp && (
                <span className="text-[10px] text-zinc-500">
                  {new Date(dec.timestamp).toLocaleTimeString('en-IN')}
                </span>
              )}
            </div>
            {dec ? (
              <div className="space-y-3">
                {/* Signal */}
                <div className="flex items-center gap-3">
                  <div
                    className="px-4 py-2 rounded-xl text-lg font-black"
                    style={{
                      background: (SIGNAL_COLORS[dec.signal] || SIGNAL_COLORS.HOLD).bg + '33',
                      color:      (SIGNAL_COLORS[dec.signal] || SIGNAL_COLORS.HOLD).bg,
                      border: `1px solid ${(SIGNAL_COLORS[dec.signal] || SIGNAL_COLORS.HOLD).bg}40`,
                    }}
                  >
                    {(SIGNAL_COLORS[dec.signal] || SIGNAL_COLORS.HOLD).icon} {dec.signal}
                  </div>
                  <div className="flex-1">
                    {/* Confidence bar */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-zinc-500">Confidence</span>
                      <span className="text-xs font-bold text-white">{dec.confidence}%</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${dec.confidence}%`,
                          background: (SIGNAL_COLORS[dec.signal] || SIGNAL_COLORS.HOLD).bg,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Price info */}
                {dec.entry_price > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-500">Entry</p>
                      <p className="text-xs font-semibold text-white">₹{fmt(dec.entry_price, 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-500">Stop Loss</p>
                      <p className="text-xs font-semibold text-red-400">₹{fmt(dec.sl_price, 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-500">Target</p>
                      <p className="text-xs font-semibold text-emerald-400">₹{fmt(dec.tp_price, 0)}</p>
                    </div>
                  </div>
                )}
                {/* Market context */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">Regime</p>
                    <p className="text-xs font-semibold" style={{
                      color: dec.regime === 'UPTREND' ? '#10b981' : dec.regime === 'DOWNTREND' ? '#ef4444' : '#f59e0b'
                    }}>{dec.regime || '—'}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">RSI</p>
                    <p className="text-xs font-semibold" style={{
                      color: (dec.rsi14 || 50) > 70 ? '#ef4444' : (dec.rsi14 || 50) < 30 ? '#10b981' : '#a1a1aa'
                    }}>{dec.rsi14 || '—'}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">Qty</p>
                    <p className="text-xs font-semibold text-white">{dec.quantity}</p>
                  </div>
                </div>
                {dec.message && (
                  <p className="text-[10px] text-zinc-500 mt-1 truncate">{dec.message}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
                <span className="text-3xl mb-2">🤖</span>
                <p className="text-xs">No decision yet</p>
                <p className="text-[10px]">Start auto mode to begin analysis</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Open Position ── */}
        {openTrade && openTrade.status === 'OPEN' && (
          <div className="bg-zinc-900/80 border border-emerald-600/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <span className="animate-pulse">●</span> Open Paper Position
              </h2>
              <span className="text-[10px] text-zinc-500">#{openTrade.trade_id}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Direction',     val: openTrade.direction,                     color: openTrade.direction === 'BUY' ? '#10b981' : '#ef4444' },
                { label: 'Ticker',        val: openTrade.ticker,                        color: '#a1a1aa' },
                { label: 'Entry',         val: `₹${fmt(openTrade.entry_price, 0)}`,    color: '#f59e0b' },
                { label: 'Quantity',      val: openTrade.quantity,                      color: '#a1a1aa' },
                { label: 'Value',         val: fmtInr(openTrade.position_value),        color: '#3b82f6' },
                { label: 'SL',            val: `₹${fmt(openTrade.sl_price, 0)}`,       color: '#ef4444' },
                { label: 'TP',            val: `₹${fmt(openTrade.tp_price, 0)}`,       color: '#10b981' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-zinc-800/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">{label}</p>
                  <p className="text-xs font-bold mt-0.5" style={{ color }}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Strategy Weights ── */}
        {rs?.dreamer_weights && Object.keys(rs.dreamer_weights).length > 0 && (
          <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">DreamerV3 Strategy Weights</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(rs.dreamer_weights)
                .sort(([, a], [, b]) => b - a)
                .map(([name, pct]) => (
                  <div key={name} className="bg-zinc-800/60 rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-zinc-400 truncate">{name}</span>
                      <span className="text-[10px] font-bold text-violet-400">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Audit Trail ── */}
        <div className="bg-zinc-900/80 border border-zinc-700/40 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Paper Trade Audit Log</h2>
            <div className="flex items-center gap-4 text-xs">
              {auditMeta.win_count != null && (
                <>
                  <span className="text-emerald-400">{auditMeta.win_count} W</span>
                  <span className="text-red-400">{auditMeta.loss_count} L</span>
                  <span className="text-zinc-400">{auditMeta.win_rate}% WR</span>
                  <span className={`font-bold ${(auditMeta.total_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(auditMeta.total_pnl || 0) >= 0 ? '+' : ''}₹{fmt(auditMeta.total_pnl, 0)}
                  </span>
                </>
              )}
            </div>
          </div>
          {audit.length === 0 ? (
            <div className="text-center py-8 text-zinc-600">
              <span className="text-3xl block mb-2">📋</span>
              <p className="text-sm">No closed paper trades yet</p>
              <p className="text-xs mt-1">Start auto mode to begin paper trading</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scroll">
              {audit.map((trade, i) => (
                <TradeRow key={trade.trade_id || i} trade={trade} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {settingsOpen && editSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h2 className="font-bold text-white">⚙ Robo-Trader Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-zinc-500 hover:text-white text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Daily Target */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-semibold">
                  Daily Profit Target (₹)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editSettings.daily_profit_target}
                    onChange={e => setEditSettings(p => ({ ...p, daily_profit_target: e.target.value }))}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="e.g. 1000"
                    min="1"
                  />
                  <div className="flex gap-1">
                    {[500, 1000, 2000, 5000].map(v => (
                      <button key={v} onClick={() => setEditSettings(p => ({ ...p, daily_profit_target: v }))}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-400 transition-colors">
                        ₹{v >= 1000 ? v/1000 + 'k' : v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Allocated Capital */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-semibold">
                  Allocated Capital (₹)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editSettings.allocated_capital}
                    onChange={e => setEditSettings(p => ({ ...p, allocated_capital: e.target.value }))}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="e.g. 100000"
                    min="1000"
                  />
                  <div className="flex gap-1">
                    {[50000, 100000, 200000, 500000].map(v => (
                      <button key={v} onClick={() => setEditSettings(p => ({ ...p, allocated_capital: v }))}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-400 transition-colors">
                        ₹{v >= 100000 ? v/100000 + 'L' : v/1000 + 'k'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ticker */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-semibold">
                  Primary Ticker
                </label>
                <input
                  type="text"
                  value={editSettings.ticker}
                  onChange={e => setEditSettings(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                  placeholder="e.g. RELIANCE.NS"
                />
              </div>

              {/* Risk Tolerance */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-semibold">
                  Risk Tolerance
                </label>
                <div className="flex gap-2">
                  {['conservative', 'moderate', 'aggressive'].map(level => (
                    <button
                      key={level}
                      onClick={() => setEditSettings(p => ({ ...p, risk_tolerance: level }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all border ${
                        editSettings.risk_tolerance === level
                          ? 'bg-violet-600/30 border-violet-500/60 text-violet-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {level === 'conservative' ? '🛡️' : level === 'moderate' ? '⚖️' : '⚡'} {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview button */}
              <button
                onClick={handlePreview}
                disabled={previewLoading}
                className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg text-sm font-semibold transition-colors"
              >
                {previewLoading ? 'Calculating…' : '🔍 Preview Risk Profile'}
              </button>

              {/* Preview results */}
              {preview && (
                <div
                  className="rounded-xl p-3 border"
                  style={{ borderColor: preview.feasibility_color + '40', background: preview.feasibility_color + '10' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold" style={{ color: preview.feasibility_color }}>
                      {preview.feasibility_label}
                    </span>
                    <span className="text-xs text-zinc-400">Score: {preview.feasibility_score}/100</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['Daily return needed', fmtPct(preview.required_daily_return_pct)],
                      ['Kelly fraction',      fmtPct((preview.kelly_fraction || 0) * 100, 3)],
                      ['Kelly position',      fmtInr(preview.kelly_position_inr)],
                      ['Final position',      fmtInr(preview.position_size_inr)],
                      ['VaR 95%',             fmtInr(preview.var_95_inr)],
                      ['CVaR 95%',            fmtInr(preview.cvar_95_inr)],
                      ['VaR 99%',             fmtInr(preview.var_99_inr)],
                      ['Max daily loss',      fmtInr(preview.daily_loss_limit)],
                      ['Vol regime',          preview.vol_regime || '—'],
                      ['NSE history',         `${preview.hist_exceedance_pct}% of days`],
                      ['Min win-rate',        fmtPct(preview.required_win_rate_min, 0)],
                      ['Budget state',        preview.risk_budget_state || 'NORMAL'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-zinc-500">{k}</span>
                        <span className="text-white font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Feasibility warnings in preview */}
                  {preview.feasibility_warnings?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {preview.feasibility_warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-400">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={() => setSettingsOpen(false)}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving…' : '💾 Save & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
