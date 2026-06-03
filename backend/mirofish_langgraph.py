"""
MiroFish v2 — LangGraph Multi-Agent Trading Analysis
=====================================================
Sequential agent workflow:
  Technical Agent → Volume Agent → Sentiment Agent → Risk Agent → Decision Agent

Each agent is an independent async LangGraph node that:
  1. Reads shared state (stock data + previous agents' outputs)
  2. Makes its own focused LLM call via emergentintegrations
  3. Returns structured JSON output to the shared state

Streaming: yields SSE events per agent completion via graph.astream()
"""

import json
import logging
import math
import os
from typing import TypedDict, Optional

from langgraph.graph import StateGraph, START, END
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────
# INDICATOR HELPERS (pure Python, no external dependencies)
# ──────────────────────────────────────────────────────────

def _ema(data: list, period: int) -> float:
    """Exponential Moving Average."""
    if len(data) < 2:
        return data[-1] if data else 0.0
    period = min(period, len(data))
    k = 2.0 / (period + 1)
    val = sum(data[:period]) / period
    for x in data[period:]:
        val = x * k + val * (1 - k)
    return round(val, 4)


def _rsi(closes: list, period: int = 14) -> float:
    """Relative Strength Index."""
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(max(1, len(closes) - period), len(closes)):
        d = closes[i] - closes[i - 1]
        (gains if d > 0 else losses).append(abs(d))
    ag = sum(gains) / period if gains else 0.001
    al = sum(losses) / period if losses else 0.001
    return round(100 - (100 / (1 + ag / al)), 2)


def _atr(bars: list, period: int = 14) -> float:
    """Average True Range."""
    trs = []
    for i in range(max(1, len(bars) - period), len(bars)):
        b, pb = bars[i], bars[i - 1]
        tr = max(
            b['high'] - b['low'],
            abs(b['high'] - pb['close']),
            abs(b['low'] - pb['close']),
        )
        trs.append(tr)
    return round(sum(trs) / len(trs), 4) if trs else 0.0


def compute_indicators(bars: list) -> dict:
    """Pre-compute all technical indicators needed by agents."""
    if not bars:
        return {}
    closes = [b['close'] for b in bars]
    highs  = [b['high']  for b in bars]
    lows   = [b['low']   for b in bars]
    vols   = [b.get('volume', 0) for b in bars]
    n = len(closes)
    price = closes[-1]

    # Trend EMAs
    ema9  = _ema(closes, 9)
    ema21 = _ema(closes, 21)
    ema50 = _ema(closes, min(50, n))

    # MACD (12,26,9)
    ema12 = _ema(closes, min(12, n))
    ema26 = _ema(closes, min(26, n))
    macd  = round(ema12 - ema26, 4)
    # Approximate signal line
    macd_vals = [_ema(closes[:k], min(12, k)) - _ema(closes[:k], min(26, k))
                 for k in range(max(10, n - 35), n)]
    signal_line = _ema(macd_vals, min(9, len(macd_vals))) if macd_vals else macd
    histogram   = round(macd - signal_line, 4)

    # Bollinger Bands (20, 2)
    window = min(20, n)
    sma20  = sum(closes[-window:]) / window
    std20  = math.sqrt(sum((c - sma20) ** 2 for c in closes[-window:]) / window) if window > 1 else 0
    bb_upper = round(sma20 + 2 * std20, 2)
    bb_lower = round(sma20 - 2 * std20, 2)
    bb_pct   = round((price - bb_lower) / (bb_upper - bb_lower), 3) if bb_upper != bb_lower else 0.5

    # ATR & RSI
    atr = _atr(bars)
    rsi = _rsi(closes)

    # Volume
    vol_window = min(20, n)
    avg_vol   = sum(vols[-vol_window:]) / vol_window if vols else 1
    recent_vol = vols[-1] if vols else 0
    vol_ratio  = round(recent_vol / avg_vol, 3) if avg_vol > 0 else 1.0

    # OBV trend (last 20 bars)
    obv_vals = [0]
    for i in range(max(1, n - 20), n):
        if closes[i] > closes[i - 1]:
            obv_vals.append(obv_vals[-1] + vols[i])
        elif closes[i] < closes[i - 1]:
            obv_vals.append(obv_vals[-1] - vols[i])
        else:
            obv_vals.append(obv_vals[-1])
    obv_trend = ("RISING"  if len(obv_vals) > 2 and obv_vals[-1] > obv_vals[0] else
                 "FALLING" if len(obv_vals) > 2 and obv_vals[-1] < obv_vals[0] else "NEUTRAL")

    # Price changes
    pct_1d = round((closes[-1] - closes[-2]) / closes[-2] * 100, 2) if n >= 2 else 0.0
    pct_5d = round((closes[-1] - closes[-6]) / closes[-6] * 100, 2) if n >= 6 else 0.0

    # Key levels
    recent_high = max(highs[-min(20, n):])
    recent_low  = min(lows[-min(20, n):])

    return dict(
        price=round(price, 2),
        rsi=rsi, ema9=round(ema9, 2), ema21=round(ema21, 2), ema50=round(ema50, 2),
        macd=macd, signal=round(signal_line, 4), histogram=histogram,
        bb_upper=bb_upper, bb_lower=bb_lower, bb_pct=bb_pct, sma20=round(sma20, 2),
        atr=atr, vol_ratio=vol_ratio, obv_trend=obv_trend,
        pct_1d=pct_1d, pct_5d=pct_5d,
        recent_high=round(recent_high, 2), recent_low=round(recent_low, 2),
        avg_volume=round(avg_vol, 0), recent_volume=recent_vol,
    )


# ──────────────────────────────────────────────────────────
# SHARED STATE
# ──────────────────────────────────────────────────────────

class MiroFishState(TypedDict, total=False):
    ticker:     str
    bars:       list
    indicators: dict
    news_text:  str
    technical:  dict
    volume:     dict
    sentiment:  dict
    risk:       dict
    decision:   dict


# ──────────────────────────────────────────────────────────
# LLM HELPER
# ──────────────────────────────────────────────────────────

async def _llm_call(system: str, user: str, session_id: str) -> str:
    """Call LLM via emergentintegrations. Returns raw text."""
    api_key = (os.environ.get("EMERGENT_LLM_KEY") or
               os.environ.get("OPENAI_API_KEY", "")).strip()
    if not api_key:
        raise RuntimeError("No LLM key configured (EMERGENT_LLM_KEY or OPENAI_API_KEY)")

    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system,
    )
    resp = await chat.send_message(UserMessage(text=user))
    return resp.text if hasattr(resp, "text") else str(resp)


def _parse_json_safe(text: str) -> dict:
    """Strip markdown fences and parse JSON safely."""
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        t = "\n".join(lines[1:]) if len(lines) > 1 else t[3:]
        t = t.rsplit("```", 1)[0].strip()
    # Find first { ... } block
    start = t.find("{")
    end   = t.rfind("}") + 1
    if start >= 0 and end > start:
        t = t[start:end]
    return json.loads(t)


# ──────────────────────────────────────────────────────────
# AGENT 1 — TECHNICAL ANALYST
# ──────────────────────────────────────────────────────────

async def technical_agent(state: MiroFishState) -> dict:
    """Analyzes RSI, EMAs, MACD, Bollinger Bands, ATR and price trend."""
    ind    = state["indicators"]
    ticker = state["ticker"]
    price  = ind["price"]

    trend = ("UPTREND"   if price > ind["ema21"] > ind["ema50"] else
             "DOWNTREND" if price < ind["ema21"] < ind["ema50"] else "SIDEWAYS")

    prompt = f"""STOCK: {ticker} | Current Price: ₹{price}

=== TECHNICAL INDICATORS ===
RSI(14):   {ind['rsi']:.1f}  {'(OVERSOLD)' if ind['rsi'] < 35 else '(OVERBOUGHT)' if ind['rsi'] > 70 else '(NEUTRAL)'}
EMA9:      {ind['ema9']:.2f}  |  EMA21: {ind['ema21']:.2f}  |  EMA50: {ind['ema50']:.2f}
MACD:      {ind['macd']:.3f}  |  Signal: {ind['signal']:.3f}  |  Histogram: {ind['histogram']:.3f} {'(BULLISH CROSS)' if ind['histogram'] > 0 else '(BEARISH CROSS)'}
BB Upper:  {ind['bb_upper']:.2f}  |  BB Lower: {ind['bb_lower']:.2f}  |  BB%: {ind['bb_pct']:.2f}
ATR(14):   {ind['atr']:.2f}  ({ind['atr']/price*100:.1f}% of price)
Trend:     {trend}
1D Change: {ind['pct_1d']:+.2f}%   |   5D Change: {ind['pct_5d']:+.2f}%
20-bar High: {ind['recent_high']:.2f}  |  20-bar Low: {ind['recent_low']:.2f}

You are a pure Technical Analysis agent. Based ONLY on the above indicators, assess:
- Is price in a bullish or bearish setup?
- Is momentum accelerating or decelerating?
- Is there a confluence of signals?

Return ONLY valid JSON:
{{
  "verdict": "BUY|SELL|HOLD",
  "confidence": <integer 1-100>,
  "reasoning": "<2 crisp sentences>",
  "trend": "{trend}",
  "signal_strength": "STRONG|MODERATE|WEAK",
  "key_support": <price number>,
  "key_resistance": <price number>,
  "momentum": "ACCELERATING|DECELERATING|FLAT"
}}"""

    try:
        raw    = await _llm_call(
            "You are a professional Technical Analysis agent. Respond with valid JSON only. No markdown, no explanation.",
            prompt,
            f"mf-tech-{ticker}-v2",
        )
        result = _parse_json_safe(raw)
    except Exception as exc:
        logger.warning(f"[TechAgent] LLM error for {ticker}: {exc}")
        verdict = ("BUY"  if ind["rsi"] < 45 and price > ind["ema21"] else
                   "SELL" if ind["rsi"] > 65 and price < ind["ema21"] else "HOLD")
        result = {
            "verdict": verdict,
            "confidence": 58,
            "reasoning": (f"RSI at {ind['rsi']:.1f}. Price {'above' if price > ind['ema21'] else 'below'} EMA21."
                          f" MACD histogram {'positive' if ind['histogram'] > 0 else 'negative'}."),
            "trend": trend,
            "signal_strength": "MODERATE",
            "key_support": ind["recent_low"],
            "key_resistance": ind["recent_high"],
            "momentum": "FLAT",
        }

    result["agent_name"] = "Technical Analyst"
    result["role"]       = "technical"
    result["icon"]       = "chart_bar"
    result["color"]      = "orange"
    return {"technical": result}


# ──────────────────────────────────────────────────────────
# AGENT 2 — VOLUME & ORDERFLOW
# ──────────────────────────────────────────────────────────

async def volume_agent(state: MiroFishState) -> dict:
    """Analyzes volume ratio, OBV, and confirms/denies technical direction."""
    ind    = state["indicators"]
    ticker = state["ticker"]
    tech   = state.get("technical", {})

    vol_ctx = ("SURGE (>2x avg)" if ind["vol_ratio"] > 2 else
               "HIGH (>1.5x avg)" if ind["vol_ratio"] > 1.5 else
               "LOW (<0.7x avg)"  if ind["vol_ratio"] < 0.7 else "NORMAL")

    prompt = f"""STOCK: {ticker} | Price: ₹{ind['price']}

=== VOLUME & ORDERFLOW DATA ===
Volume Ratio (today vs 20-bar avg): {ind['vol_ratio']:.2f}x  →  {vol_ctx}
OBV Trend (20 bars):  {ind['obv_trend']}
Avg Volume (20-bar):  {ind['avg_volume']:,.0f}
Today's Volume:       {ind['recent_volume']:,.0f}
Price Change (1D):    {ind['pct_1d']:+.2f}%

=== TECHNICAL AGENT CONTEXT ===
Verdict: {tech.get('verdict', 'N/A')}  |  Trend: {tech.get('trend', 'N/A')}  |  Strength: {tech.get('signal_strength', 'N/A')}

You are a Volume & Orderflow specialist. Assess:
- Does volume CONFIRM or DENY the price move?
- Is there institutional accumulation or distribution?
- Is the move sustainable based on volume?

Return ONLY valid JSON:
{{
  "verdict": "BUY|SELL|HOLD",
  "confidence": <integer 1-100>,
  "reasoning": "<2 crisp sentences>",
  "orderflow_signal": "ACCUMULATION|DISTRIBUTION|NEUTRAL",
  "volume_strength": "STRONG|MODERATE|WEAK",
  "confirms_technical": <true|false>,
  "unusual_activity": <true|false>
}}"""

    try:
        raw    = await _llm_call(
            "You are a Volume & Orderflow Analysis specialist. Respond with valid JSON only.",
            prompt,
            f"mf-vol-{ticker}-v2",
        )
        result = _parse_json_safe(raw)
    except Exception as exc:
        logger.warning(f"[VolAgent] LLM error for {ticker}: {exc}")
        confirms = tech.get("verdict") == ("BUY" if ind["pct_1d"] > 0 else "SELL")
        result = {
            "verdict": tech.get("verdict", "HOLD"),
            "confidence": 55,
            "reasoning": (f"Volume ratio {ind['vol_ratio']:.1f}x with {vol_ctx}. "
                          f"OBV is {ind['obv_trend']}, {'confirming' if confirms else 'diverging from'} price action."),
            "orderflow_signal": ("ACCUMULATION" if ind["pct_1d"] > 0 and ind["vol_ratio"] > 1
                                 else "DISTRIBUTION" if ind["pct_1d"] < 0 and ind["vol_ratio"] > 1
                                 else "NEUTRAL"),
            "volume_strength": ("STRONG"   if ind["vol_ratio"] > 1.5 else
                                "MODERATE" if ind["vol_ratio"] > 1.0 else "WEAK"),
            "confirms_technical": confirms,
            "unusual_activity": ind["vol_ratio"] > 2.0,
        }

    result["agent_name"] = "Volume & Orderflow"
    result["role"]       = "volume"
    result["icon"]       = "chart_line"
    result["color"]      = "sky"
    return {"volume": result}


# ──────────────────────────────────────────────────────────
# AGENT 3 — SENTIMENT (News + Twitter/X)
# ──────────────────────────────────────────────────────────

async def sentiment_agent(state: MiroFishState) -> dict:
    """Analyzes news headlines + infers Twitter/X social sentiment."""
    ind    = state["indicators"]
    ticker = state["ticker"]
    news   = state.get("news_text", "No news available")
    tech   = state.get("technical", {})

    prompt = f"""STOCK: {ticker} | Price: ₹{ind['price']} | 1D: {ind['pct_1d']:+.2f}%

=== LATEST NEWS (Yahoo Finance) ===
{news}

=== MARKET CONTEXT ===
RSI: {ind['rsi']:.1f}  |  Technical Trend: {tech.get('trend', 'N/A')}  |  5D: {ind['pct_5d']:+.2f}%

You are a Sentiment Analysis agent. Do two things:
1. Analyze the actual news headlines for sentiment
2. INFER Twitter/X social sentiment based on price action, news momentum, and market context
   (High RSI + positive news = Twitter likely bullish; sharp drops + negative news = bearish buzz)

Return ONLY valid JSON:
{{
  "verdict": "BUY|SELL|HOLD",
  "confidence": <integer 1-100>,
  "reasoning": "<2 crisp sentences>",
  "news_sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
  "twitter_sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
  "buzz_level": "HIGH|MEDIUM|LOW",
  "sentiment_score": <-100 to +100>,
  "news_summary": "<1 line key takeaway>",
  "catalyst": "<key event/catalyst or 'None'>"
}}"""

    try:
        raw    = await _llm_call(
            "You are a Market Sentiment & Social Media analyst. Respond with valid JSON only.",
            prompt,
            f"mf-sent-{ticker}-v2",
        )
        result = _parse_json_safe(raw)
    except Exception as exc:
        logger.warning(f"[SentAgent] LLM error for {ticker}: {exc}")
        result = {
            "verdict": "HOLD",
            "confidence": 48,
            "reasoning": "News sentiment analysis unavailable. Defaulting to neutral.",
            "news_sentiment": "NEUTRAL",
            "twitter_sentiment": "NEUTRAL",
            "buzz_level": "LOW",
            "sentiment_score": 0,
            "news_summary": "No significant catalyst identified.",
            "catalyst": "None",
        }

    result["agent_name"] = "Sentiment (News+X)"
    result["role"]       = "sentiment"
    result["icon"]       = "newspaper"
    result["color"]      = "purple"
    return {"sentiment": result}


# ──────────────────────────────────────────────────────────
# AGENT 4 — RISK MANAGER
# ──────────────────────────────────────────────────────────

async def risk_agent(state: MiroFishState) -> dict:
    """Calculates SL, R:R, risk level using ATR + previous agent context."""
    ind    = state["indicators"]
    ticker = state["ticker"]
    tech   = state.get("technical", {})
    vol    = state.get("volume", {})
    sent   = state.get("sentiment", {})
    price  = ind["price"]
    atr    = ind["atr"]

    # Pre-compute ATR-based SL levels
    sl_long  = round(price - 1.5 * atr, 2)
    sl_short = round(price + 1.5 * atr, 2)

    # Count bullish vs bearish signals
    bullish = sum(1 for a in [tech, vol, sent] if a.get("verdict") == "BUY")
    bearish = sum(1 for a in [tech, vol, sent] if a.get("verdict") == "SELL")

    prompt = f"""STOCK: {ticker} | Price: ₹{price}

=== RISK PARAMETERS ===
ATR(14):         {atr:.2f}  ({atr/price*100:.1f}% daily expected move)
ATR-SL (Long):   {sl_long:.2f}  (1.5×ATR below price)
ATR-SL (Short):  {sl_short:.2f}  (1.5×ATR above price)
BB Lower:        {ind['bb_lower']:.2f}
20-bar Low:      {ind['recent_low']:.2f}
20-bar High:     {ind['recent_high']:.2f}

=== PREVIOUS AGENT CONSENSUS ===
Technical:  {tech.get('verdict', 'N/A')} ({tech.get('confidence', 0)}%) — {tech.get('signal_strength', 'N/A')} {tech.get('trend', '')}
Volume:     {vol.get('verdict', 'N/A')} ({vol.get('confidence', 0)}%) — {vol.get('orderflow_signal', 'N/A')}
Sentiment:  {sent.get('verdict', 'N/A')} ({sent.get('confidence', 0)}%) — {sent.get('news_sentiment', 'N/A')}
Bullish signals: {bullish}/3  |  Bearish signals: {bearish}/3

As the Risk Manager, determine:
- Is the risk/reward favorable?
- What is the optimal stop loss placement?
- How risky is this trade right now?

Return ONLY valid JSON:
{{
  "recommended_action": "BUY|SELL|HOLD",
  "confidence": <integer 1-100>,
  "reasoning": "<2 crisp sentences>",
  "sl_price": <stop loss price number>,
  "risk_level": "LOW|MEDIUM|HIGH|EXTREME",
  "risk_reward": "<ratio like 1:2.5>",
  "max_loss_pct": <percentage like 2.3>,
  "position_note": "<brief sizing note>"
}}"""

    try:
        raw    = await _llm_call(
            "You are a professional Risk Management specialist for equity trading. Respond with valid JSON only.",
            prompt,
            f"mf-risk-{ticker}-v2",
        )
        result = _parse_json_safe(raw)
    except Exception as exc:
        logger.warning(f"[RiskAgent] LLM error for {ticker}: {exc}")
        direction = tech.get("verdict", "HOLD")
        sl        = sl_long if direction == "BUY" else sl_short
        result = {
            "recommended_action": direction,
            "confidence": 60,
            "reasoning": (f"ATR-based SL at {sl:.2f} ({atr/price*100:.1f}% risk). "
                          f"{'Favorable' if bullish > bearish else 'Unfavorable'} signal confluence with {bullish}/3 bullish agents."),
            "sl_price": sl,
            "risk_level": "HIGH" if atr / price > 0.03 else "MEDIUM" if atr / price > 0.015 else "LOW",
            "risk_reward": "1:2",
            "max_loss_pct": round(atr / price * 100 * 1.5, 1),
            "position_note": "Standard 1-2% portfolio risk",
        }

    result["agent_name"] = "Risk Manager"
    result["role"]       = "risk"
    result["icon"]       = "shield"
    result["color"]      = "yellow"
    return {"risk": result}


# ──────────────────────────────────────────────────────────
# AGENT 5 — DECISION AGENT (FINAL VOTE)
# ──────────────────────────────────────────────────────────

async def decision_agent(state: MiroFishState) -> dict:
    """Aggregates all 4 agents and produces the definitive trading signal."""
    ind    = state["indicators"]
    ticker = state["ticker"]
    tech   = state.get("technical", {})
    vol    = state.get("volume", {})
    sent   = state.get("sentiment", {})
    risk   = state.get("risk", {})
    price  = ind["price"]
    atr    = ind["atr"]

    # Weighted vote tally (Risk agent has 2x weight)
    votes = [
        (tech.get("verdict", "HOLD"),                   tech.get("confidence", 50),   1.0),
        (vol.get("verdict", "HOLD"),                    vol.get("confidence", 50),    1.0),
        (sent.get("verdict", "HOLD"),                   sent.get("confidence", 50),   0.8),
        (risk.get("recommended_action", "HOLD"),        risk.get("confidence", 50),   1.5),
    ]
    buy_score  = sum(c * w for v, c, w in votes if v == "BUY")
    sell_score = sum(c * w for v, c, w in votes if v == "SELL")
    hold_score = sum(c * w for v, c, w in votes if v == "HOLD")
    total      = buy_score + sell_score + hold_score + 0.01

    pre_signal = ("BUY"  if buy_score  > sell_score * 1.25 and buy_score  > hold_score else
                  "SELL" if sell_score > buy_score  * 1.25 and sell_score > hold_score else "WAIT")

    # Target estimation
    t1_buy  = round(price + 1.5 * atr, 2)
    t2_buy  = round(price + 2.5 * atr, 2)
    t3_buy  = round(price + 4.0 * atr, 2)
    t1_sell = round(price - 1.5 * atr, 2)
    t2_sell = round(price - 2.5 * atr, 2)
    t3_sell = round(price - 4.0 * atr, 2)
    day_t   = t1_buy if pre_signal == "BUY" else t1_sell

    sl_from_risk = risk.get("sl_price", round(price - 1.5 * atr, 2))

    prompt = f"""STOCK: {ticker} | Price: ₹{price}

=== ALL AGENT VERDICTS ===
1. Technical Analyst: {tech.get('verdict','HOLD')} ({tech.get('confidence',50)}%) | {tech.get('trend','')} | {tech.get('reasoning','')}
2. Volume & Orderflow: {vol.get('verdict','HOLD')} ({vol.get('confidence',50)}%) | {vol.get('orderflow_signal','')} | {vol.get('reasoning','')}
3. Sentiment (News+X): {sent.get('verdict','HOLD')} ({sent.get('confidence',50)}%) | News:{sent.get('news_sentiment','')} Twitter:{sent.get('twitter_sentiment','')} | {sent.get('reasoning','')}
4. Risk Manager: {risk.get('recommended_action','HOLD')} ({risk.get('confidence',50)}%) | SL:{risk.get('sl_price','')} R:R {risk.get('risk_reward','')} | {risk.get('reasoning','')}

PRE-VOTE: BUY={buy_score:.0f} / SELL={sell_score:.0f} / HOLD={hold_score:.0f} → Pre-signal: {pre_signal}

=== PRICE TARGETS (ATR-based estimates) ===
ATR: {atr:.2f}
BUY  targets: T1={t1_buy} T2={t2_buy} T3={t3_buy}
SELL targets: T1={t1_sell} T2={t2_sell} T3={t3_sell}
SL from Risk Agent: {sl_from_risk}

As the FINAL DECISION AGENT, you have the final word. Consider:
- Is the signal from all 4 agents aligned?
- Is the risk/reward worth it?
- Give BUY/SELL/WAIT with precise entry, SL, and targets

Return ONLY valid JSON:
{{
  "signal": "BUY|SELL|WAIT",
  "entry_price": "{price:.2f}",
  "stop_loss": "<price>",
  "day_target": "<intraday target price>",
  "targets": ["<T1 price>", "<T2 price>", "<T3 price>"],
  "swarm_consensus": "BULLISH|BEARISH|NEUTRAL",
  "consensus_score": <0-100>,
  "confidence": <0-100>,
  "risk_reward": "<ratio>",
  "news_catalyst": "{sent.get('catalyst', 'None')}",
  "recommendation": "<2-3 line clear trade plan with entry / SL / target>"
}}"""

    try:
        raw    = await _llm_call(
            "You are the Final Decision Agent for a trading system. Give the definitive signal. Respond with valid JSON only.",
            prompt,
            f"mf-decision-{ticker}-v2",
        )
        result = _parse_json_safe(raw)
    except Exception as exc:
        logger.warning(f"[DecisionAgent] LLM error for {ticker}: {exc}")
        t1 = t1_buy if pre_signal == "BUY" else t1_sell
        t2 = t2_buy if pre_signal == "BUY" else t2_sell
        t3 = t3_buy if pre_signal == "BUY" else t3_sell
        cscore = round((buy_score if pre_signal == "BUY" else sell_score) / total * 100)
        result = {
            "signal": pre_signal,
            "entry_price": f"{price:.2f}",
            "stop_loss": str(round(sl_from_risk, 2)),
            "day_target": str(day_t),
            "targets": [str(t1), str(t2), str(t3)],
            "swarm_consensus": ("BULLISH" if pre_signal == "BUY" else
                                "BEARISH" if pre_signal == "SELL" else "NEUTRAL"),
            "consensus_score": cscore,
            "confidence": cscore,
            "risk_reward": risk.get("risk_reward", "1:2"),
            "news_catalyst": sent.get("catalyst", "None"),
            "recommendation": (
                f"{'BUY above' if pre_signal == 'BUY' else 'SELL below' if pre_signal == 'SELL' else 'WAIT for confirmation at'} "
                f"₹{price}. SL: ₹{sl_from_risk:.2f}. "
                f"Target: ₹{t1} / ₹{t2}. {tech.get('trend', '')} trend with "
                f"{vol.get('orderflow_signal', 'neutral')} orderflow."
            ),
        }

    result["agent_name"] = "Decision Agent"
    result["role"]       = "decision"
    result["icon"]       = "lightning"
    result["color"]      = "emerald"
    return {"decision": result}


# ──────────────────────────────────────────────────────────
# BUILD LANGGRAPH WORKFLOW
# ──────────────────────────────────────────────────────────

def build_mirofish_graph():
    """Build and compile the LangGraph 5-agent pipeline."""
    wf = StateGraph(MiroFishState)

    wf.add_node("technical_agent", technical_agent)
    wf.add_node("volume_agent",    volume_agent)
    wf.add_node("sentiment_agent", sentiment_agent)
    wf.add_node("risk_agent",      risk_agent)
    wf.add_node("decision_agent",  decision_agent)

    wf.add_edge(START,             "technical_agent")
    wf.add_edge("technical_agent", "volume_agent")
    wf.add_edge("volume_agent",    "sentiment_agent")
    wf.add_edge("sentiment_agent", "risk_agent")
    wf.add_edge("risk_agent",      "decision_agent")
    wf.add_edge("decision_agent",  END)

    return wf.compile()


# Lazy singleton — compiled once and reused
_GRAPH = None


def get_mirofish_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_mirofish_graph()
    return _GRAPH


# ──────────────────────────────────────────────────────────
# SSE STREAM RUNNER
# ──────────────────────────────────────────────────────────

AGENT_META = {
    "technical_agent": {"step": 1, "label": "Technical Analyst",     "color": "orange"},
    "volume_agent":    {"step": 2, "label": "Volume & Orderflow",     "color": "sky"},
    "sentiment_agent": {"step": 3, "label": "Sentiment (News+X)",     "color": "purple"},
    "risk_agent":      {"step": 4, "label": "Risk Manager",           "color": "yellow"},
    "decision_agent":  {"step": 5, "label": "Decision Agent (Final)", "color": "emerald"},
}


async def run_mirofish_stream(initial_state: dict):
    """
    Async generator that yields SSE-formatted strings as each agent completes.
    Use with FastAPI StreamingResponse(media_type='text/event-stream').
    """
    graph = get_mirofish_graph()

    try:
        async for chunk in graph.astream(initial_state, stream_mode="updates"):
            # chunk = { "node_name": { state_key: value } }
            node_name = next(iter(chunk), None)
            if not node_name:
                continue

            node_output = chunk[node_name]
            # The key in node_output is the state field updated by this agent
            agent_key  = next(iter(node_output), None)
            agent_data = node_output.get(agent_key, {}) if agent_key else {}
            meta       = AGENT_META.get(node_name, {"step": 0, "label": node_name, "color": "zinc"})

            payload = {
                "type":       "agent_done",
                "node":       node_name,
                "agent_key":  agent_key,
                "step":       meta["step"],
                "total":      5,
                "progress":   meta["step"] * 20,
                "label":      meta["label"],
                "color":      meta["color"],
                "data":       agent_data,
            }
            yield f"data: {json.dumps(payload)}\n\n"

    except Exception as exc:
        logger.error(f"MiroFish stream error: {exc}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    yield "data: [DONE]\n\n"
