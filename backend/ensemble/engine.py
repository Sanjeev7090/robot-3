"""
Multi-AI Ensemble Decision Engine.

Routes prompts to 3 LLMs in parallel (Claude Sonnet 4.5, Gemini 3 Pro, GPT-5.2),
parses JSON-structured opinions {signal, confidence, rationale}, and combines
them via weighted voting + majority-with-avg-confidence.

Default provider = Emergent LLM Key. To switch to a user-hosted
freellmapi proxy, set:
    LLM_PROVIDER_MODE=freellmapi
    LLM_BASE_URL=http://<host>:3001/v1
    LLM_API_KEY=freellmapi-...
"""

import asyncio
import json
import logging
import os
import re
import uuid
from typing import Dict, List, Optional, Tuple

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ensemble model configuration
# ---------------------------------------------------------------------------
# (provider, model, display_name, weight) — weights normalised at vote time.
DEFAULT_ENSEMBLE: List[Tuple[str, str, str, float]] = [
    ("anthropic", "claude-sonnet-4-5-20250929", "Claude Sonnet 4.5", 1.20),
    ("gemini",    "gemini-3.1-pro-preview",    "Gemini 3 Pro",       1.00),
    ("openai",    "gpt-5.2",                   "GPT-5.2",            1.10),
]

SIGNAL_TOKENS = ("BUY", "SELL", "HOLD", "ABSTAIN")


def _get_api_key() -> str:
    """Return the API key to use based on LLM_PROVIDER_MODE."""
    mode = os.environ.get("LLM_PROVIDER_MODE", "emergent").lower()
    if mode == "freellmapi":
        key = os.environ.get("LLM_API_KEY")
        if key:
            return key
        logger.warning("LLM_PROVIDER_MODE=freellmapi but LLM_API_KEY empty — falling back to Emergent key")
    return os.environ.get("EMERGENT_LLM_KEY", "")


def _get_base_url() -> Optional[str]:
    mode = os.environ.get("LLM_PROVIDER_MODE", "emergent").lower()
    if mode == "freellmapi":
        url = os.environ.get("LLM_BASE_URL")
        if url:
            return url
    return None  # default = emergent built-in


# ---------------------------------------------------------------------------
# JSON extraction helper (LLMs sometimes wrap JSON in markdown fences)
# ---------------------------------------------------------------------------

_JSON_PAT = re.compile(r"\{[\s\S]*\}")


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    # Strip code fences
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    # First try whole string
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        pass
    # Find first {...} block
    m = _JSON_PAT.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Single-model async call
# ---------------------------------------------------------------------------

async def _ask_via_ai_router(
    model: str,
    display_name: str,
    system_message: str,
    user_text: str,
    timeout: float = 45.0,
) -> Dict:
    """Call via the local AI Router (OpenCode Free / configured providers)."""
    import time
    start = time.time()
    try:
        from ai_router.engine import ai_complete
        resp = await asyncio.wait_for(
            ai_complete(
                messages=[{"role": "user", "content": user_text}],
                model=model,
                system=system_message,
                temperature=0.3,
                max_tokens=1024,
            ),
            timeout=timeout,
        )
        latency = int((time.time() - start) * 1000)
        if resp is None:
            return {"model": display_name, "provider": "ai_router", "ok": False,
                    "raw": "", "parsed": None, "error": "router returned None",
                    "latency_ms": latency}
        return {
            "model": display_name, "provider": "ai_router",
            "ok": True, "raw": resp, "parsed": _extract_json(resp),
            "error": None, "latency_ms": latency,
        }
    except asyncio.TimeoutError:
        return {"model": display_name, "provider": "ai_router", "ok": False,
                "raw": "", "parsed": None, "error": "timeout",
                "latency_ms": int((time.time() - start) * 1000)}
    except Exception as exc:
        return {"model": display_name, "provider": "ai_router", "ok": False,
                "raw": "", "parsed": None, "error": str(exc)[:300],
                "latency_ms": int((time.time() - start) * 1000)}


async def _ask_one_model(
    provider: str,
    model: str,
    display_name: str,
    system_message: str,
    user_text: str,
    timeout: float = 30.0,
) -> Dict:
    """Call one LLM. Returns dict {model, ok, raw, parsed, error, latency_ms}."""
    import time
    start = time.time()

    # Prefer AI Router when no Emergent key configured
    emergent_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not emergent_key:
        return await _ask_via_ai_router(model, display_name, system_message, user_text, timeout)

    try:
        chat = LlmChat(
            api_key=_get_api_key(),
            session_id=f"ensemble-{uuid.uuid4().hex[:8]}",
            system_message=system_message,
        ).with_model(provider, model)

        msg = UserMessage(text=user_text)
        resp = await asyncio.wait_for(chat.send_message(msg), timeout=timeout)
        latency = int((time.time() - start) * 1000)
        return {
            "model":    display_name,
            "provider": provider,
            "ok":       True,
            "raw":      resp,
            "parsed":   _extract_json(resp),
            "error":    None,
            "latency_ms": latency,
        }
    except asyncio.TimeoutError:
        return {"model": display_name, "provider": provider, "ok": False,
                "raw": "", "parsed": None, "error": "timeout",
                "latency_ms": int((time.time() - start) * 1000)}
    except Exception as exc:
        logger.warning("Ensemble model %s failed: %s — trying AI Router", display_name, exc)
        # Fallback to AI Router
        return await _ask_via_ai_router(model, display_name, system_message, user_text, timeout)


# ---------------------------------------------------------------------------
# Voting
# ---------------------------------------------------------------------------

def _vote(results: List[Dict]) -> Dict:
    """
    Combine N model verdicts.
    Each result.parsed should have: signal (BUY/SELL/HOLD), confidence (0-100), rationale.
    Returns:
      {
        consensus: BUY/SELL/HOLD/ABSTAIN,
        confidence: int 0-100 (avg of voters for the winning signal),
        weighted_score: { BUY: x, SELL: y, HOLD: z },
        valid_voters: int,
        votes: [{model, signal, confidence, rationale, weight}],
      }
    """
    weighted_score = {"BUY": 0.0, "SELL": 0.0, "HOLD": 0.0}
    votes: List[Dict] = []
    valid = 0
    total_weight = 0.0
    # Map of weight by display_name
    weight_map = {d[2]: d[3] for d in DEFAULT_ENSEMBLE}

    for r in results:
        if not r.get("ok") or not r.get("parsed"):
            votes.append({
                "model": r["model"], "signal": None, "confidence": 0,
                "rationale": r.get("error") or "no parsable response",
                "weight": weight_map.get(r["model"], 1.0),
                "ok": False,
            })
            continue
        p = r["parsed"]
        sig = str(p.get("signal", "HOLD")).upper().strip()
        if sig not in ("BUY", "SELL", "HOLD"):
            sig = "HOLD"
        try:
            conf = float(p.get("confidence", 0))
        except (ValueError, TypeError):
            conf = 0.0
        conf = max(0.0, min(100.0, conf))
        w = weight_map.get(r["model"], 1.0)
        weighted_score[sig] += w * (conf / 100.0)
        total_weight += w
        valid += 1
        votes.append({
            "model": r["model"], "signal": sig, "confidence": round(conf, 1),
            "rationale": str(p.get("rationale", ""))[:400],
            "weight": w, "ok": True,
        })

    if valid == 0:
        return {"consensus": "ABSTAIN", "confidence": 0, "weighted_score": weighted_score,
                "valid_voters": 0, "votes": votes, "method": "weighted+majority"}

    # Pick winner
    consensus = max(weighted_score, key=weighted_score.get)
    top_score = weighted_score[consensus]
    runner_up = max(v for k, v in weighted_score.items() if k != consensus)

    # Sharp disagreement → ABSTAIN
    if top_score <= 0.01 or (top_score - runner_up) < 0.05:
        # Near-tie: keep majority signal but mark low confidence
        pass

    # Avg confidence among voters that picked the consensus
    consensus_voters = [v for v in votes if v.get("ok") and v["signal"] == consensus]
    if consensus_voters:
        avg_conf = sum(v["confidence"] for v in consensus_voters) / len(consensus_voters)
        # Penalise if not unanimous
        unanimity = len(consensus_voters) / valid
        final_conf = avg_conf * (0.7 + 0.3 * unanimity)
    else:
        final_conf = 0.0

    # Force ABSTAIN if confidence very low
    if final_conf < 30:
        consensus_label = "ABSTAIN"
    else:
        consensus_label = consensus

    return {
        "consensus":       consensus_label,
        "raw_consensus":   consensus,
        "confidence":      int(round(final_conf)),
        "weighted_score":  {k: round(v, 3) for k, v in weighted_score.items()},
        "valid_voters":    valid,
        "total_voters":    len(results),
        "votes":           votes,
        "method":          "weighted+majority+avg-conf",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

ENSEMBLE_SYSTEM_PROMPT = (
    "You are a senior NSE/BSE Indian-market quantitative trading analyst. "
    "Given a market snapshot with current price and technical context, output a STRICT JSON with EXACTLY these keys: "
    '`signal` ("BUY", "SELL", or "HOLD"), '
    "`confidence` (integer 0-100), "
    "`entry_price` (float — recommended entry, near current price), "
    "`stop_loss` (float — strict stop-loss level), "
    "`target_1` (float — first short-term target), "
    "`target_2` (float — second medium target), "
    "`target_3` (float — third day/swing target), "
    "`rationale` (1-2 short sentences). "
    "Base entry/SL/targets on the provided ATR, support, resistance levels. "
    "Do NOT include any prose outside the JSON. Do not wrap in markdown fences."
)


async def ask_ensemble(user_text: str, system_message: str = ENSEMBLE_SYSTEM_PROMPT) -> Dict:
    """Run all 3 models in parallel, vote, return consensus dict."""
    tasks = [
        _ask_one_model(prov, mdl, name, system_message, user_text)
        for prov, mdl, name, _w in DEFAULT_ENSEMBLE
    ]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    verdict = _vote(results)
    verdict["per_model"] = results
    verdict["provider_mode"] = os.environ.get("LLM_PROVIDER_MODE", "emergent")
    return verdict


def get_status() -> Dict:
    """Return current ensemble config (for UI / health checks)."""
    return {
        "provider_mode":  os.environ.get("LLM_PROVIDER_MODE", "emergent"),
        "base_url":       _get_base_url() or "(emergent built-in)",
        "models": [
            {"provider": p, "model": m, "display_name": n, "weight": w}
            for (p, m, n, w) in DEFAULT_ENSEMBLE
        ],
        "key_configured": bool(_get_api_key()),
    }
