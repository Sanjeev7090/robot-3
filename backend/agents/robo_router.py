"""
FastAPI Router for Dreamer V3 Robo-Trader.
Endpoints:
  GET  /api/robo/settings          — get current user preferences + risk profile
  POST /api/robo/settings          — update daily_target and/or allocated_capital
  GET  /api/robo/status            — full robo state (P&L, progress, decision)
  POST /api/robo/start             — start auto mode (paper trading)
  POST /api/robo/stop              — stop auto mode
  POST /api/robo/reset-daily       — reset daily P&L counters
  GET  /api/robo/decision          — latest DreamerV3 decision
  GET  /api/robo/audit             — paper trade audit trail
  POST /api/robo/risk-preview      — preview risk profile for arbitrary settings (no save)

DISCLAIMER: PAPER TRADING ONLY. No guaranteed returns.
"""

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional

from . import dreamer_robo_orchestrator as orch

robo_router = APIRouter(prefix="/api/robo", tags=["Robo Trader"])


# ─── Request Models ───────────────────────────────────────────────────────────

class SettingsRequest(BaseModel):
    daily_profit_target: Optional[float] = Field(
        None, gt=0, description="Daily profit target in ₹"
    )
    allocated_capital: Optional[float] = Field(
        None, gt=1000, description="Allocated capital in ₹"
    )
    ticker: Optional[str] = Field(None, description="NSE/BSE ticker symbol")
    risk_tolerance: Optional[str] = Field(
        None, description="conservative | moderate | aggressive"
    )


class StartRequest(BaseModel):
    ticker: Optional[str] = None


class RiskPreviewRequest(BaseModel):
    daily_profit_target: float = Field(..., gt=0)
    allocated_capital: float   = Field(..., gt=1000)
    risk_tolerance: str        = "moderate"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@robo_router.get("/settings")
async def get_settings():
    """Get current user preferences + computed risk profile."""
    state = orch.get_robo_state()
    return {
        "success": True,
        "preferences": {
            "daily_profit_target": state.get("daily_profit_target", orch.DEFAULT_DAILY_TARGET),
            "allocated_capital":   state.get("allocated_capital",   orch.DEFAULT_CAPITAL),
            "ticker":              state.get("ticker",              orch.DEFAULT_TICKER),
            "risk_tolerance":      state.get("risk_tolerance",      "moderate"),
            "auto_mode":           state.get("auto_mode",            False),
        },
        "risk_profile": state.get("risk_profile", {}),
        "disclaimer": "For research and paper-trading use only.",
    }


@robo_router.post("/settings")
async def update_settings(req: SettingsRequest, bg: BackgroundTasks):
    """
    Update daily target and/or allocated capital.
    Immediately recalculates risk profile + feasibility.
    Can be called at any time — even while auto mode is active.
    """
    result = orch.update_user_preferences(
        daily_profit_target = req.daily_profit_target,
        allocated_capital   = req.allocated_capital,
        ticker              = req.ticker,
        risk_tolerance      = req.risk_tolerance,
    )
    # Persist to DB in background
    bg.add_task(orch.save_preferences_to_db)
    return result


@robo_router.get("/status")
async def get_status():
    """Full robo state including daily P&L progress, open trade, and DreamerV3 decision."""
    state = orch.get_robo_state()
    # Don't return the full audit trail here (use /audit endpoint)
    s = dict(state)
    s["audit_trail"] = []
    return {"success": True, **s}


@robo_router.post("/start")
async def start_auto_mode(req: StartRequest):
    """
    Start autonomous paper-trading loop.
    System will:
      1. Poll DreamerV3 for signals every 60 seconds
      2. Open/close paper trades based on signal strength and risk profile
      3. Track daily P&L vs your target
      4. Auto-pause on circuit breaker events
    DISCLAIMER: Paper trading only — no real orders placed.
    """
    return orch.start_auto_mode(ticker=req.ticker)


@robo_router.post("/stop")
async def stop_auto_mode():
    """Stop the autonomous trading loop."""
    return orch.stop_auto_mode()


@robo_router.post("/reset-daily")
async def reset_daily():
    """Reset daily P&L counters (call at start of each trading day)."""
    return orch.reset_daily()


@robo_router.get("/decision")
async def get_latest_decision():
    """Get the latest DreamerV3 trade decision with risk-adjusted parameters."""
    return {"success": True, "decision": orch.get_latest_decision()}


@robo_router.get("/audit")
async def get_audit_trail(limit: int = 50):
    """Get paper trade audit trail (last N closed trades)."""
    trades = orch.get_audit_trail(limit=min(limit, 100))
    total_pnl = sum(t.get("pnl", 0) or 0 for t in trades)
    wins  = sum(1 for t in trades if (t.get("pnl") or 0) >= 0)
    losses = len(trades) - wins
    return {
        "success":    True,
        "trades":     trades,
        "count":      len(trades),
        "total_pnl":  round(total_pnl, 2),
        "win_count":  wins,
        "loss_count": losses,
        "win_rate":   round(wins / max(len(trades), 1) * 100, 1),
    }


@robo_router.post("/risk-preview")
async def risk_preview(req: RiskPreviewRequest):
    """
    Preview risk profile for arbitrary settings without saving them.
    Useful for the frontend "What-if" calculator.
    """
    prefs = orch.UserPreferences(
        daily_profit_target = req.daily_profit_target,
        allocated_capital   = req.allocated_capital,
        risk_tolerance      = req.risk_tolerance,
    )
    risk = orch._recalculate_risk(prefs)
    return {
        "success":    True,
        "preview":    risk.to_dict(),
        "disclaimer": "Preview only. Actual results depend on market conditions.",
    }
