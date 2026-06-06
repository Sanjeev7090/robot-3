"""
FastAPI Router — Dreamer V3 Robo-Trader (Phase 2)
==================================================
Endpoints:
  GET  /api/robo/settings          — fetch current user settings + full RPM risk profile
  POST /api/robo/settings          — update daily_target / allocated_capital (auto-recalculates)
  POST /api/robo/recalculate       — force full recalculation with live market data + audit log
  GET  /api/robo/status            — full robo state (P&L, progress, decision, capital state)
  POST /api/robo/start             — start autonomous paper-trading loop
  POST /api/robo/stop              — stop auto mode
  POST /api/robo/reset-daily       — reset daily P&L counters
  GET  /api/robo/decision          — latest DreamerV3 decision with RPM-sized position
  GET  /api/robo/audit             — paper trade audit trail (closed trades)
  POST /api/robo/risk-preview      — what-if calculator (no save)
  GET  /api/robo/risk-report       — full RPM report: Kelly + VaR + Feasibility + Budget
  GET  /api/robo/recalc-history    — last N recalculation audit records from MongoDB
  GET  /api/robo/capital-state     — current DreamerV3 capital state vector

DISCLAIMER: PAPER TRADING ONLY. No guaranteed returns.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel, Field

from . import dreamer_robo_orchestrator as orch
from .risk_portfolio_manager import (
    rpm,
    check_feasibility,
    compute_position_size,
    compute_var_cvar,
    compute_dynamic_risk_budget,
    get_volatility_regime,
)

logger = logging.getLogger(__name__)

robo_router = APIRouter(prefix="/api/robo", tags=["Robo Trader — Phase 2"])

DISCLAIMER = (
    "⚠️  PAPER TRADING / RESEARCH ONLY. No guaranteed returns. "
    "Past performance ≠ future results. Consult a SEBI-registered advisor."
)


# ════════════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ════════════════════════════════════════════════════════════════════════════════

class SettingsRequest(BaseModel):
    daily_profit_target: Optional[float] = Field(
        None, gt=0, description="Daily profit target in ₹ (e.g. 500, 2000)"
    )
    allocated_capital: Optional[float] = Field(
        None, gt=1000, description="Allocated trading capital in ₹"
    )
    ticker: Optional[str] = Field(None, description="NSE/BSE ticker (e.g. RELIANCE.NS)")
    risk_tolerance: Optional[str] = Field(
        None, description="conservative | moderate | aggressive"
    )
    mode: Optional[str] = Field(
        None, description="paper | live  (live applies 30% extra safety multiplier)"
    )


class StartRequest(BaseModel):
    ticker: Optional[str] = None


class RiskPreviewRequest(BaseModel):
    """What-if calculator — preview risk profile without saving."""
    daily_profit_target: float = Field(..., gt=0,    description="Daily target in ₹")
    allocated_capital:   float = Field(..., gt=1000, description="Capital in ₹")
    risk_tolerance:      str   = Field("moderate",  description="conservative|moderate|aggressive")
    ticker:              str   = Field("RELIANCE.NS", description="NSE ticker for live ATR fetch")


class RecalculateRequest(BaseModel):
    trigger: str = Field("force", description="Label for audit trail (e.g. user_manual, scheduled)")


# ════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════

# ─── 1. GET /settings ─────────────────────────────────────────────────────────
@robo_router.get("/settings")
async def get_settings():
    """
    Get current user preferences and the latest computed RPM risk profile.

    Response includes:
      • preferences (daily_target, capital, tolerance, mode, ticker)
      • risk_profile (position sizing, VaR, feasibility, dynamic budget)
      • capital_state_vector (normalised values for DreamerV3)
    """
    state = orch.get_robo_state()

    # Use RPM's cached full profile if available, else fall back to state
    risk_profile = state.get("risk_profile", {})
    if not risk_profile.get("kelly_fraction"):
        # First call or stale: run a quick recalculation
        try:
            risk_profile = orch._recalculate_risk_full(trigger="on_demand")
            orch._upd(risk_profile=risk_profile)
        except Exception as e:
            logger.warning("[robo_router] On-demand recalc failed: %s", e)

    cap_state = rpm.get_capital_state_vector(
        current_pnl         = state.get("daily_pnl", 0.0),
        trades_today        = state.get("daily_trades", 0),
        open_position_value = (state.get("open_trade") or {}).get("position_value", 0.0),
    )
    return {
        "success": True,
        "preferences": {
            "daily_profit_target": state.get("daily_profit_target", orch.DEFAULT_DAILY_TARGET),
            "allocated_capital":   state.get("allocated_capital",   orch.DEFAULT_CAPITAL),
            "ticker":              state.get("ticker",              orch.DEFAULT_TICKER),
            "risk_tolerance":      state.get("risk_tolerance",      "moderate"),
            "mode":                state.get("mode",                "paper"),
            "auto_mode":           state.get("auto_mode",           False),
        },
        "risk_profile":        risk_profile,
        "capital_state_vector": cap_state,
        "rpm_settings":        rpm.to_settings_dict(),
        "disclaimer":          DISCLAIMER,
    }


# ─── 2. POST /settings ────────────────────────────────────────────────────────
@robo_router.post("/settings")
async def update_settings(req: SettingsRequest, bg: BackgroundTasks):
    """
    Update daily_target and/or allocated_capital.

    Immediately triggers full RPM recalculation:
      • Kelly + ATR + vol-regime position sizing
      • Parametric VaR / CVaR (95% + 99%)
      • 6-tier feasibility check with warnings
      • Dynamic risk budget state
      • Portfolio heat check

    Safe to call at any time — even while auto mode is running.
    Changes take effect on the next trade decision.
    """
    result = orch.update_user_preferences(
        daily_profit_target = req.daily_profit_target,
        allocated_capital   = req.allocated_capital,
        ticker              = req.ticker,
        risk_tolerance      = req.risk_tolerance,
    )
    # Persist settings + audit record in background
    bg.add_task(orch.save_preferences_to_db)
    bg.add_task(rpm.save_settings_to_db)

    # Attach capital state vector to response
    result["capital_state_vector"] = rpm.get_capital_state_vector(
        current_pnl=0.0, trades_today=0, open_position_value=0.0
    )
    result["disclaimer"] = DISCLAIMER
    return result


# ─── 3. POST /recalculate ─────────────────────────────────────────────────────
@robo_router.post("/recalculate")
async def force_recalculate(req: RecalculateRequest, bg: BackgroundTasks):
    """
    Force a full risk recalculation with fresh live market data.

    Use this when:
      • Market has moved significantly
      • Volatility regime has changed (earnings, RBI policy, etc.)
      • You want to see updated VaR after a position change
      • Before starting a new trading session

    Returns the complete RPM risk profile + audit record ID.
    Recalculation audit is logged to MongoDB asynchronously.
    """
    state = orch.get_robo_state()

    risk_profile = orch._recalculate_risk_full(
        trigger      = req.trigger,
        current_pnl  = state.get("daily_pnl", 0.0),
        trades_today = state.get("daily_trades", 0),
    )

    # Update state
    orch._upd(risk_profile=risk_profile)

    # Background: persist audit to DB
    bg.add_task(rpm.save_settings_to_db)

    cap_state = rpm.get_capital_state_vector(
        current_pnl         = state.get("daily_pnl", 0.0),
        trades_today        = state.get("daily_trades", 0),
        open_position_value = (state.get("open_trade") or {}).get("position_value", 0.0),
    )

    return {
        "success":             True,
        "risk_profile":        risk_profile,
        "capital_state_vector": cap_state,
        "market_context":      rpm.last_market_ctx,
        "audit_id":            rpm.last_audit_id,
        "computation_ms":      risk_profile.get("computation_ms"),
        "warnings":            risk_profile.get("warnings", []),
        "feasibility_warnings": risk_profile.get("feasibility_warnings", []),
        "disclaimer":          DISCLAIMER,
    }


# ─── 4. GET /status ───────────────────────────────────────────────────────────
@robo_router.get("/status")
async def get_status():
    """
    Full robo state: daily P&L progress, open trade, DreamerV3 decision,
    capital state vector, portfolio heat, and risk budget state.
    """
    state = orch.get_robo_state()
    s = dict(state)
    s["audit_trail"] = []   # use /audit endpoint for trades

    # Attach live RPM metrics
    s["portfolio_heat_pct"]  = round(rpm.get_portfolio_heat(state.get("allocated_capital")) * 100, 3)
    s["heat_exceeded"]       = rpm.is_heat_exceeded()
    s["capital_state_vector"] = rpm.get_capital_state_vector(
        current_pnl         = state.get("daily_pnl", 0.0),
        trades_today        = state.get("daily_trades", 0),
        open_position_value = (state.get("open_trade") or {}).get("position_value", 0.0),
    )
    if rpm.last_risk_budget:
        s["risk_budget"] = asdict(rpm.last_risk_budget)

    return {"success": True, **s}


# ─── 5. POST /start ───────────────────────────────────────────────────────────
@robo_router.post("/start")
async def start_auto_mode(req: StartRequest):
    """
    Start the autonomous paper-trading loop.

    Before starting, system:
      1. Runs full RPM recalculation with live market data
      2. Checks feasibility — warns if target is aggressive
      3. Resets daily P&L counters
      4. Spawns background worker (polls DreamerV3 every 60 seconds)

    Requires DreamerV3 to be actively training (RL Agent tab).
    DISCLAIMER: Paper trades only — no real orders placed.
    """
    return orch.start_auto_mode(ticker=req.ticker)


# ─── 6. POST /stop ────────────────────────────────────────────────────────────
@robo_router.post("/stop")
async def stop_auto_mode():
    """Stop the autonomous trading loop."""
    return orch.stop_auto_mode()


# ─── 7. POST /reset-daily ─────────────────────────────────────────────────────
@robo_router.post("/reset-daily")
async def reset_daily():
    """Reset daily P&L counters. Call at the start of each NSE trading session."""
    return orch.reset_daily()


# ─── 8. GET /decision ─────────────────────────────────────────────────────────
@robo_router.get("/decision")
async def get_latest_decision():
    """
    Latest DreamerV3 trade decision including RPM-sized position parameters.
    Includes capital state vector so frontend can display normalised metrics.
    """
    state = orch.get_robo_state()
    dec   = orch.get_latest_decision()
    return {
        "success":             True,
        "decision":            dec,
        "capital_state_vector": rpm.get_capital_state_vector(
            current_pnl         = state.get("daily_pnl", 0.0),
            trades_today        = state.get("daily_trades", 0),
            open_position_value = (state.get("open_trade") or {}).get("position_value", 0.0),
        ),
    }


# ─── 9. GET /audit ────────────────────────────────────────────────────────────
@robo_router.get("/audit")
async def get_audit_trail(limit: int = Query(50, ge=1, le=100)):
    """Get paper trade audit trail (last N closed trades) with summary statistics."""
    trades    = orch.get_audit_trail(limit=limit)
    total_pnl = sum(t.get("pnl", 0) or 0 for t in trades)
    wins      = sum(1 for t in trades if (t.get("pnl") or 0) >= 0)
    losses    = len(trades) - wins
    return {
        "success":    True,
        "trades":     trades,
        "count":      len(trades),
        "total_pnl":  round(total_pnl, 2),
        "win_count":  wins,
        "loss_count": losses,
        "win_rate":   round(wins / max(len(trades), 1) * 100, 1),
    }


# ─── 10. POST /risk-preview ───────────────────────────────────────────────────
@robo_router.post("/risk-preview")
async def risk_preview(req: RiskPreviewRequest):
    """
    What-if risk calculator — full RPM analysis for arbitrary settings without saving.

    Returns:
      • position_size (Kelly + ATR + vol-regime)
      • VaR / CVaR (95% + 99%)
      • Feasibility (6-tier with warnings and NSE historical context)
      • Dynamic risk budget preview
      • Volatility regime classification
    """
    import time
    t0 = time.perf_counter()

    # Temporarily update RPM settings without saving
    orig_target  = rpm.daily_target
    orig_capital = rpm.allocated_capital
    orig_tol     = rpm.risk_tolerance
    orig_ticker  = rpm.ticker

    rpm.update_settings(
        daily_target      = req.daily_profit_target,
        allocated_capital = req.allocated_capital,
        risk_tolerance    = req.risk_tolerance,
        ticker            = req.ticker,
    )

    risk_profile = rpm.full_recalculate(trigger="preview")

    # Restore original settings
    rpm.update_settings(
        daily_target      = orig_target,
        allocated_capital = orig_capital,
        risk_tolerance    = orig_tol,
        ticker            = orig_ticker,
    )

    comp_ms = round((time.perf_counter() - t0) * 1000, 1)

    return {
        "success":         True,
        "preview":         risk_profile,
        "market_context":  rpm.last_market_ctx,
        "computation_ms":  comp_ms,
        "disclaimer":      DISCLAIMER,
    }


# ─── 11. GET /risk-report ─────────────────────────────────────────────────────
@robo_router.get("/risk-report")
async def get_risk_report():
    """
    Full RPM risk report for the current settings.

    Sections:
      • position_sizing: Kelly fraction, ATR method, vol-regime, final size
      • var_cvar: parametric VaR and CVaR at 95% and 99%
      • feasibility: 6-tier assessment with historical NSE context and warnings
      • dynamic_budget: intra-day risk budget state
      • portfolio_heat: total deployed risk vs capital
      • capital_state: normalised DreamerV3 state vector
      • market_context: live price, ATR, regime, RSI
    """
    state = orch.get_robo_state()

    pos  = rpm.last_position_size
    var  = rpm.last_var_result
    feas = rpm.last_feasibility
    budg = rpm.last_risk_budget
    heat = rpm.get_portfolio_heat(state.get("allocated_capital"))

    return {
        "success": True,
        "settings": rpm.to_settings_dict(),
        "position_sizing": asdict(pos)  if pos  else {},
        "var_cvar":        asdict(var)  if var  else {},
        "feasibility":     asdict(feas) if feas else {},
        "dynamic_budget":  asdict(budg) if budg else {},
        "portfolio_heat": {
            "heat_pct":         round(heat * 100, 3),
            "max_heat_pct":     6.0,
            "exceeded":         heat > 0.06,
            "open_risk_count":  len(rpm._open_risks),
        },
        "capital_state_vector": rpm.get_capital_state_vector(
            current_pnl         = state.get("daily_pnl", 0.0),
            trades_today        = state.get("daily_trades", 0),
            open_position_value = (state.get("open_trade") or {}).get("position_value", 0.0),
        ),
        "market_context":   rpm.last_market_ctx,
        "last_recalculated": rpm.last_recalc_ts,
        "disclaimer":        DISCLAIMER,
    }


# ─── 12. GET /recalc-history ──────────────────────────────────────────────────
@robo_router.get("/recalc-history")
async def get_recalculation_history(limit: int = Query(10, ge=1, le=50)):
    """
    Fetch the last N recalculation audit records from MongoDB.
    Each record contains full inputs, outputs, timing, and warnings count.
    """
    records = await rpm.get_recalculation_history(limit=limit)
    return {
        "success": True,
        "count":   len(records),
        "records": records,
    }


# ─── 13. GET /capital-state ───────────────────────────────────────────────────
@robo_router.get("/capital-state")
async def get_capital_state():
    """
    Get the current normalised capital state vector for DreamerV3 world model.
    All values in [0,1] or [-1,1] — ready to concat with market observation.
    """
    state = orch.get_robo_state()
    vec   = rpm.get_capital_state_vector(
        current_pnl         = state.get("daily_pnl", 0.0),
        trades_today        = state.get("daily_trades", 0),
        open_position_value = (state.get("open_trade") or {}).get("position_value", 0.0),
    )
    return {
        "success":          True,
        "capital_state":    vec,
        "raw_values": {
            "daily_pnl":       round(state.get("daily_pnl", 0.0), 2),
            "daily_target":    rpm.daily_target,
            "allocated_capital": rpm.allocated_capital,
            "portfolio_heat_pct": round(rpm.get_portfolio_heat() * 100, 3),
            "trades_today":    state.get("daily_trades", 0),
        },
    }
