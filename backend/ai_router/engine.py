"""
AI Router Engine
================
9router-style multi-provider routing with auto-fallback.

Providers are stored in MongoDB (`ai_router_providers` collection).
OpenCode Free is seeded by default (no auth needed, 45+ models).

Usage:
    from ai_router.engine import ai_complete, get_providers, seed_defaults

    text = await ai_complete(
        messages=[{"role":"user","content":"Hello"}],
        model="claude-sonnet-4-5",
    )
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger("ai_router")

# ---------------------------------------------------------------------------
# Default providers (seeded once on startup)
# ---------------------------------------------------------------------------
DEFAULT_PROVIDERS = [
    {
        "id": "emergent-llm",
        "name": "Emergent LLM (Claude/GPT/Gemini)",
        "description": "Powered by Emergent Universal Key — Claude Sonnet, GPT-4o, Gemini Pro. No user API key needed.",
        "base_url": "https://api.anthropic.com/v1",  # used internally via emergentintegrations
        "api_key": "",           # will use EMERGENT_LLM_KEY from env
        "provider_type": "emergent",
        "priority": 1,
        "is_active": True,
        "models": ["claude-sonnet-4-5", "claude-haiku-4-5", "gpt-4o", "gpt-4o-mini", "gemini-1.5-flash"],
        "stats": {
            "requests": 0, "tokens_input": 0, "tokens_output": 0,
            "errors": 0, "last_used": None,
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "opencode-free",
        "name": "OpenCode Free (via 9router)",
        "description": "45+ models FREE. Requires 9router running at localhost:20128. Setup: https://github.com/decolua/9router",
        "base_url": "http://localhost:20128/v1",
        "api_key": "9router-local",
        "provider_type": "openai_compatible",
        "priority": 2,
        "is_active": False,   # disabled until user sets up 9router
        "models": [],
        "stats": {
            "requests": 0, "tokens_input": 0, "tokens_output": 0,
            "errors": 0, "last_used": None,
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
]

# ---------------------------------------------------------------------------
# MongoDB helpers
# ---------------------------------------------------------------------------
_db = None

def _get_db():
    global _db
    if _db is None:
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        client = AsyncIOMotorClient(mongo_url)
        _db = client[db_name]
    return _db


async def _coll():
    return _get_db()["ai_router_providers"]


# ---------------------------------------------------------------------------
# Seed + CRUD
# ---------------------------------------------------------------------------

async def seed_defaults():
    """Insert default providers if the collection is empty."""
    coll = await _coll()
    count = await coll.count_documents({})
    if count == 0:
        await coll.insert_many(DEFAULT_PROVIDERS)
        logger.info("AI Router: seeded %d default providers", len(DEFAULT_PROVIDERS))


async def get_providers(active_only=False) -> List[Dict]:
    coll = await _coll()
    flt = {"is_active": True} if active_only else {}
    docs = await coll.find(flt, {"_id": 0}).sort("priority", 1).to_list(100)
    return docs


async def get_provider(provider_id: str) -> Optional[Dict]:
    coll = await _coll()
    return await coll.find_one({"id": provider_id}, {"_id": 0})


async def add_provider(data: Dict) -> Dict:
    coll = await _coll()
    new_id = data.get("id") or f"provider-{uuid.uuid4().hex[:8]}"
    doc = {
        "id": new_id,
        "name": data.get("name", new_id),
        "description": data.get("description", ""),
        "base_url": data["base_url"].rstrip("/"),
        "api_key": data.get("api_key", ""),
        "priority": data.get("priority", 99),
        "is_active": True,
        "models": [],
        "stats": {"requests": 0, "tokens_input": 0, "tokens_output": 0, "errors": 0, "last_used": None},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await coll.insert_one(doc)
    # Try fetching models immediately
    try:
        await sync_provider_models(new_id)
    except Exception:
        pass
    return await get_provider(new_id)


async def update_provider(provider_id: str, data: Dict) -> Optional[Dict]:
    coll = await _coll()
    allowed = {"name", "base_url", "api_key", "priority", "is_active", "description"}
    upd = {k: v for k, v in data.items() if k in allowed}
    if upd:
        await coll.update_one({"id": provider_id}, {"$set": upd})
    return await get_provider(provider_id)


async def delete_provider(provider_id: str):
    coll = await _coll()
    await coll.delete_one({"id": provider_id})


# ---------------------------------------------------------------------------
# Model sync
# ---------------------------------------------------------------------------

async def sync_provider_models(provider_id: str) -> List[str]:
    """Fetch model list from /v1/models of the provider and cache it."""
    provider = await get_provider(provider_id)
    if not provider:
        return []
    base = provider["base_url"]
    headers = {}
    if provider.get("api_key"):
        headers["Authorization"] = f"Bearer {provider['api_key']}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{base}/models", headers=headers)
            resp.raise_for_status()
            data = resp.json()
            models = [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
    except Exception as e:
        logger.warning("AI Router: sync_models failed for %s: %s", provider_id, e)
        return []

    coll = await _coll()
    await coll.update_one({"id": provider_id}, {"$set": {"models": models}})
    logger.info("AI Router: synced %d models for provider %s", len(models), provider_id)
    return models


async def get_all_models() -> List[Dict]:
    """Return all models grouped by provider."""
    providers = await get_providers(active_only=True)
    result = []
    for p in providers:
        for m in p.get("models", []):
            result.append({"id": m, "provider_id": p["id"], "provider_name": p["name"]})
    return result


# ---------------------------------------------------------------------------
# Test connection
# ---------------------------------------------------------------------------

async def test_provider(provider_id: str) -> Dict:
    provider = await get_provider(provider_id)
    if not provider:
        return {"ok": False, "error": "Provider not found"}
    base = provider["base_url"]
    headers = {"Content-Type": "application/json"}
    if provider.get("api_key"):
        headers["Authorization"] = f"Bearer {provider['api_key']}"

    # Pick first available model or use a safe default
    models = provider.get("models", [])
    test_model = models[0] if models else "gpt-4o"

    payload = {
        "model": test_model,
        "messages": [{"role": "user", "content": "Reply with one word: OK"}],
        "max_tokens": 5,
    }
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            latency_ms = int((time.time() - t0) * 1000)
            return {"ok": True, "latency_ms": latency_ms, "model_used": test_model, "reply": text}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300], "latency_ms": int((time.time() - t0) * 1000)}


# ---------------------------------------------------------------------------
# Core routing
# ---------------------------------------------------------------------------

async def ai_complete(
    messages: List[Dict],
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    system: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Optional[str]:
    """
    Call LLMs via configured providers with auto-fallback.
    Returns response text or None if all providers fail.
    """
    providers = await get_providers(active_only=True)
    if not providers:
        logger.warning("AI Router: no active providers configured")
        return None

    # Build full messages list
    full_messages = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    coll = await _coll()

    for provider in providers:
        provider_type = provider.get("provider_type", "openai_compatible")

        # ---------------------------------------------------------------
        # Emergent provider — uses emergentintegrations LlmChat
        # ---------------------------------------------------------------
        if provider_type == "emergent":
            emergent_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
            if not emergent_key:
                logger.warning("AI Router: Emergent provider skipped — EMERGENT_LLM_KEY not set")
                continue
            t0 = time.time()
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                # model → provider mapping
                m = model or "claude-sonnet-4-5"
                prov = "openai"
                if m.startswith("claude"):
                    prov = "anthropic"
                elif m.startswith("gemini"):
                    prov = "google"
                chat = LlmChat(
                    api_key=emergent_key,
                    session_id=session_id or f"airouter-{uuid.uuid4().hex[:8]}",
                    system_message=system or "",
                ).with_model(prov, m)
                resp = await asyncio.wait_for(
                    chat.send_message(UserMessage(text=messages[-1]["content"] if messages else "")),
                    timeout=60.0,
                )
                latency_ms = int((time.time() - t0) * 1000)
                coll = await _coll()
                await coll.update_one(
                    {"id": provider["id"]},
                    {
                        "$inc": {"stats.requests": 1},
                        "$set": {"stats.last_used": datetime.now(timezone.utc).isoformat()},
                    },
                )
                logger.info("AI Router: Emergent → %s (%dms)", m, latency_ms)
                return resp
            except Exception as e:
                coll = await _coll()
                await coll.update_one({"id": provider["id"]}, {"$inc": {"stats.errors": 1}})
                logger.warning("AI Router: Emergent provider failed: %s — trying next", e)
                continue

        # ---------------------------------------------------------------
        # Standard OpenAI-compatible provider
        # ---------------------------------------------------------------
        base = provider["base_url"]
        headers = {"Content-Type": "application/json"}
        if provider.get("api_key"):
            headers["Authorization"] = f"Bearer {provider['api_key']}"

        # Choose model: use requested if available, else first from provider list
        available = provider.get("models", [])
        chosen_model = model
        if model and available and model not in available:
            # Try prefix match (e.g., "claude-sonnet-4-5" → "claude-sonnet-4-5")
            candidates = [m for m in available if model.replace("-", "").lower() in m.replace("-", "").lower()]
            chosen_model = candidates[0] if candidates else (available[0] if available else model)
        elif not model and available:
            chosen_model = available[0]
        elif not chosen_model:
            chosen_model = "gpt-4o"

        payload = {
            "model": chosen_model,
            "messages": full_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"] or ""
                latency_ms = int((time.time() - t0) * 1000)

                # Update stats
                usage = data.get("usage", {})
                await coll.update_one(
                    {"id": provider["id"]},
                    {
                        "$inc": {
                            "stats.requests": 1,
                            "stats.tokens_input": usage.get("prompt_tokens", 0),
                            "stats.tokens_output": usage.get("completion_tokens", 0),
                        },
                        "$set": {"stats.last_used": datetime.now(timezone.utc).isoformat()},
                    },
                )
                logger.info(
                    "AI Router: %s → %s (%dms, %d+%d tokens)",
                    provider["name"], chosen_model, latency_ms,
                    usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0),
                )
                return content

        except httpx.HTTPStatusError as e:
            if e.response.status_code in (429, 503, 502, 500):
                # Quota/server error → try next provider
                await coll.update_one({"id": provider["id"]}, {"$inc": {"stats.errors": 1}})
                logger.warning("AI Router: %s returned %d, trying next provider", provider["name"], e.response.status_code)
                continue
            await coll.update_one({"id": provider["id"]}, {"$inc": {"stats.errors": 1}})
            logger.warning("AI Router: %s HTTP error %d: %s", provider["name"], e.response.status_code, str(e)[:200])
            continue
        except Exception as e:
            await coll.update_one({"id": provider["id"]}, {"$inc": {"stats.errors": 1}})
            logger.warning("AI Router: %s failed: %s — trying next provider", provider["name"], str(e)[:200])
            continue

    logger.error("AI Router: all %d providers failed", len(providers))
    return None


async def get_stats() -> Dict:
    """Aggregate stats across all providers."""
    providers = await get_providers()
    total = {"requests": 0, "tokens_input": 0, "tokens_output": 0, "errors": 0}
    for p in providers:
        s = p.get("stats", {})
        for k in total:
            total[k] += s.get(k, 0)
    # Rough cost estimate: OpenCode Free = $0, so savings = tokens * $0.00003 (GPT-4o rate)
    saved_usd = round((total["tokens_input"] + total["tokens_output"]) * 0.00003 / 1000, 4)
    return {
        "total_requests": total["requests"],
        "total_tokens_input": total["tokens_input"],
        "total_tokens_output": total["tokens_output"],
        "total_errors": total["errors"],
        "estimated_cost_saved_usd": saved_usd,
        "active_providers": sum(1 for p in providers if p.get("is_active")),
        "total_models": sum(len(p.get("models", [])) for p in providers if p.get("is_active")),
    }
