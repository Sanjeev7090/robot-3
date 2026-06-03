"""FastAPI router for Multi-AI Ensemble Decision Engine."""

import json
import logging
from typing import Optional

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from . import engine as ensemble_engine
from . import gann_optimizer

logger = logging.getLogger(__name__)

ensemble_router = APIRouter(prefix="/api/ensemble", tags=["Multi-AI Ensemble"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SignalRequest(BaseModel):
    ticker: str
    # Optional pre-computed context; if missing, we build it from yfinance.
    context: Optional[dict] = None
    extra_prompt: Optional[str] = None


class GannRequest(BaseModel):
    ticker: str


class FreePrompt(BaseModel):
    user_text: str
    system_message: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@ensemble_router.get("/status")
async def status():
    return ensemble_engine.get_status()


@ensemble_router.post("/signal")
async def signal(req: SignalRequest):
    """
    Generic ensemble signal for a ticker.
    Builds a market snapshot (or uses caller-provided one) and asks all 3 models.
    """
    context = req.context
    if not context:
        df = gann_optimizer._fetch_recent_bars(req.ticker)
        if df is None or len(df) < 20:
            return {"success": False, "error": f"Could not fetch data for {req.ticker}"}
        context = gann_optimizer._market_context(df)

    prompt = {
        "ticker": req.ticker,
        "snapshot": context,
        "task": "Output BUY/SELL/HOLD with confidence and a short rationale.",
    }
    if req.extra_prompt:
        prompt["additional_instructions"] = req.extra_prompt

    verdict = await ensemble_engine.ask_ensemble(json.dumps(prompt, indent=2))
    return {
        "success":  True,
        "ticker":   req.ticker,
        "context":  context,
        "verdict":  verdict,
    }


@ensemble_router.post("/gann-optimize")
async def gann_optimize(req: GannRequest):
    """AI-driven Gann + Square-of-9 optimisation."""
    return await gann_optimizer.ai_optimize_gann(req.ticker)


@ensemble_router.post("/ask")
async def ask_free(req: FreePrompt):
    """Free-form ensemble prompt (for power users / debugging)."""
    sys_msg = req.system_message or ensemble_engine.ENSEMBLE_SYSTEM_PROMPT
    return await ensemble_engine.ask_ensemble(req.user_text, system_message=sys_msg)
