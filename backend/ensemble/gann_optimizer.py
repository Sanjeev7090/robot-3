"""
AI Gann Pattern Recognition.

Uses Multi-AI ensemble to dynamically optimise:
  1. Gann angle multipliers (1x1, 1x2, 2x1, 1x4, 4x1, 1x8, 8x1) → which are active
  2. Square-of-9 ring radius (8, 16, 24, 32) → which gives most actionable targets
  3. Pivot auto-detection — agent picks best recent swing-high/low as anchor

All three return AI-tuned values along with confidence.
"""

import json
import logging
import math
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .engine import ask_ensemble

logger = logging.getLogger(__name__)

GANN_ANGLES_ALL = [
    {"name": "1x8", "ratio": 1 / 8, "degrees": 7.5},
    {"name": "1x4", "ratio": 1 / 4, "degrees": 15.0},
    {"name": "1x3", "ratio": 1 / 3, "degrees": 18.75},
    {"name": "1x2", "ratio": 1 / 2, "degrees": 26.25},
    {"name": "1x1", "ratio": 1.0,   "degrees": 45.0},
    {"name": "2x1", "ratio": 2.0,   "degrees": 63.75},
    {"name": "3x1", "ratio": 3.0,   "degrees": 71.25},
    {"name": "4x1", "ratio": 4.0,   "degrees": 75.0},
    {"name": "8x1", "ratio": 8.0,   "degrees": 82.5},
]

SOQ_RINGS = [8, 16, 24, 32]


# ---------------------------------------------------------------------------
# Data fetch + pivot detection
# ---------------------------------------------------------------------------

def _fetch_recent_bars(ticker: str, period: str = "3mo") -> Optional[pd.DataFrame]:
    try:
        import yfinance as yf
        df = yf.download(ticker, period=period, interval="1d",
                         progress=False, auto_adjust=True)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        if len(df) < 20:
            return None
        return df
    except Exception as exc:
        logger.warning("yfinance fetch failed for %s: %s", ticker, exc)
        return None


def _detect_pivots(df: pd.DataFrame, window: int = 5) -> Dict:
    """
    Detect 5 most recent swing highs & lows using fractal-style window.
    Returns ranked candidates with timestamp, price, type, age_bars, strength.
    """
    highs, lows = [], []
    n = len(df)
    for i in range(window, n - window):
        h = df["High"].iloc[i]
        l_ = df["Low"].iloc[i]
        if h == df["High"].iloc[i - window:i + window + 1].max():
            highs.append({"idx": i, "ts": df.index[i].isoformat(), "price": float(h),
                          "type": "swing_high", "age_bars": n - 1 - i})
        if l_ == df["Low"].iloc[i - window:i + window + 1].min():
            lows.append({"idx": i, "ts": df.index[i].isoformat(), "price": float(l_),
                         "type": "swing_low", "age_bars": n - 1 - i})

    # Score: recent + extreme = strong. score = (1/age) * abs(price - mean)
    mean_close = float(df["Close"].mean())
    for p in highs + lows:
        p["strength"] = round(
            (1.0 / (p["age_bars"] + 1)) * abs(p["price"] - mean_close) / (mean_close + 1e-8) * 100,
            3,
        )
    pivots = sorted(highs + lows, key=lambda x: x["strength"], reverse=True)[:8]
    return {"candidates": pivots, "bars_analysed": n}


def _market_context(df: pd.DataFrame) -> Dict:
    c = df["Close"]
    close = float(c.iloc[-1])
    ret_1d = float((c.iloc[-1] - c.iloc[-2]) / c.iloc[-2]) if len(c) > 1 else 0.0
    ret_5d = float((c.iloc[-1] - c.iloc[-5]) / c.iloc[-5]) if len(c) > 5 else 0.0
    ret_20d = float((c.iloc[-1] - c.iloc[-20]) / c.iloc[-20]) if len(c) > 20 else 0.0
    vol_20 = float(c.pct_change().rolling(20).std().iloc[-1] or 0.0)
    ema20 = float(c.ewm(span=20).mean().iloc[-1])
    sma50 = float(c.rolling(50).mean().iloc[-1]) if len(c) >= 50 else float(c.mean())
    trend = "up" if ema20 > sma50 * 1.01 else ("down" if ema20 < sma50 * 0.99 else "sideways")
    return {
        "close": round(close, 2),
        "ret_1d_pct": round(ret_1d * 100, 2),
        "ret_5d_pct": round(ret_5d * 100, 2),
        "ret_20d_pct": round(ret_20d * 100, 2),
        "vol_20d_pct": round(vol_20 * 100, 2),
        "ema20": round(ema20, 2),
        "sma50": round(sma50, 2),
        "trend": trend,
    }


# ---------------------------------------------------------------------------
# Pure-math Gann + Square of 9 (used after AI picks parameters)
# ---------------------------------------------------------------------------

def _build_gann_fan(pivot_price: float, active_angles: List[str]) -> List[Dict]:
    out = []
    for a in GANN_ANGLES_ALL:
        if a["name"] not in active_angles:
            continue
        # Resistance (above pivot) & support (below) over 100 bars
        # We just emit ratio & angle — frontend draws the rays.
        out.append({
            "name":    a["name"],
            "ratio":   a["ratio"],
            "degrees": a["degrees"],
            "support_100": round(pivot_price - a["ratio"] * pivot_price * 0.10, 2),
            "resistance_100": round(pivot_price + a["ratio"] * pivot_price * 0.10, 2),
        })
    return out


def _build_square_of_9(center_price: float, ring: int) -> List[Dict]:
    """
    Square-of-9: rings of 8/16/24/... cardinal & ordinal points around a center.
    Generates `ring` levels above & below.
    """
    root = math.sqrt(center_price)
    levels: List[Dict] = []
    # Cardinal/ordinal multiples of 45° around the spiral
    step_deg = 360.0 / ring  # ring=8 → 45°, ring=16 → 22.5°, etc.
    for i in range(1, ring + 1):
        deg = step_deg * i
        # Spiral formula: price_n = (sqrt(p) ± deg/180)^2
        up   = (root + (deg / 180.0)) ** 2
        down = (root - (deg / 180.0)) ** 2
        if down <= 0:
            continue
        levels.append({
            "step":          i,
            "angle_deg":     round(deg, 1),
            "resistance":    round(up, 2),
            "support":       round(down, 2),
            "ring":          ring,
        })
    return levels


# ---------------------------------------------------------------------------
# Main AI-driven Gann optimisation
# ---------------------------------------------------------------------------

GANN_SYSTEM_PROMPT = (
    "You are a master technical analyst expert in W.D. Gann's angle theory and "
    "Square-of-9 price-time geometry, applied to Indian NSE/BSE equities. "
    "You receive (1) recent price action context, (2) candidate swing pivots, "
    "(3) the list of available Gann angles & SoQ rings. "
    "You select the OPTIMAL parameters for the current market regime. "
    "Respond with STRICT JSON only — no prose, no markdown — with this exact schema: "
    "{"
    '"signal": "BUY|SELL|HOLD", '
    '"confidence": 0-100, '
    '"rationale": "1-2 sentence reason", '
    '"chosen_pivot_idx": <int index into pivots list>, '
    '"active_angles": ["1x1", "1x2", ...],  // 3-5 most relevant angles for THIS regime '
    '"soq_ring": 8|16|24|32  // which ring resolution gives best targets here'
    "}"
)


async def ai_optimize_gann(ticker: str) -> Dict:
    """
    Run full AI-driven Gann optimisation:
      • Fetch bars + detect pivots + market context
      • Ask 3-model ensemble to choose pivot + active angles + SoQ ring
      • Compute Gann fan & SoQ rings with AI-chosen params
      • Return both raw ensemble votes and final levels
    """
    df = _fetch_recent_bars(ticker)
    if df is None or len(df) < 30:
        return {
            "success": False,
            "error": f"Could not fetch enough data for {ticker}",
        }

    context = _market_context(df)
    pivots = _detect_pivots(df)
    candidates = pivots["candidates"][:6]
    if not candidates:
        return {"success": False, "error": "No pivots detected"}

    # Compose prompt
    prompt = json.dumps({
        "ticker": ticker,
        "market_context": context,
        "pivot_candidates": candidates,
        "available_angles": [a["name"] for a in GANN_ANGLES_ALL],
        "available_soq_rings": SOQ_RINGS,
        "task": (
            "Pick the strongest pivot (index from pivot_candidates), the 3-5 Gann angles "
            "that are most relevant for the current regime, and the SoQ ring that gives "
            "actionable targets near the current price. Also output overall BUY/SELL/HOLD."
        ),
    }, indent=2)

    verdict = await ask_ensemble(prompt, system_message=GANN_SYSTEM_PROMPT)

    # ---- Reconcile per-model Gann choices via majority + average ----
    chosen_pivot_idxs: List[int] = []
    chosen_angles: List[List[str]] = []
    chosen_rings: List[int] = []
    for r in verdict.get("per_model", []):
        p = r.get("parsed") or {}
        if "chosen_pivot_idx" in p:
            try:
                idx = int(p["chosen_pivot_idx"])
                if 0 <= idx < len(candidates):
                    chosen_pivot_idxs.append(idx)
            except (ValueError, TypeError):
                pass
        if isinstance(p.get("active_angles"), list):
            chosen_angles.append([str(x) for x in p["active_angles"]])
        if "soq_ring" in p:
            try:
                ring = int(p["soq_ring"])
                if ring in SOQ_RINGS:
                    chosen_rings.append(ring)
            except (ValueError, TypeError):
                pass

    # Pivot: most-voted index (fallback: strongest pivot)
    if chosen_pivot_idxs:
        pivot_idx = max(set(chosen_pivot_idxs), key=chosen_pivot_idxs.count)
    else:
        pivot_idx = 0
    chosen_pivot = candidates[pivot_idx]

    # Angles: union of all chosen, capped at 5 most frequent
    angle_counts: Dict[str, int] = {}
    for lst in chosen_angles:
        for a in lst:
            angle_counts[a] = angle_counts.get(a, 0) + 1
    active_angles = sorted(angle_counts.keys(), key=lambda x: -angle_counts[x])[:5]
    if not active_angles:
        active_angles = ["1x1", "1x2", "2x1"]  # safe default

    # SoQ ring: majority, fallback 16
    soq_ring = max(set(chosen_rings), key=chosen_rings.count) if chosen_rings else 16

    gann_fan = _build_gann_fan(chosen_pivot["price"], active_angles)
    soq_levels = _build_square_of_9(context["close"], soq_ring)

    return {
        "success":        True,
        "ticker":         ticker,
        "market_context": context,
        "pivot_candidates": candidates,
        "chosen_pivot":   {**chosen_pivot, "selected_index": pivot_idx},
        "active_angles":  active_angles,
        "all_angles":     [a["name"] for a in GANN_ANGLES_ALL],
        "gann_fan":       gann_fan,
        "soq_ring":       soq_ring,
        "available_soq_rings": SOQ_RINGS,
        "soq_levels":     soq_levels,
        "ensemble":       verdict,
    }
