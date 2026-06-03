"""
AI Router FastAPI routes — /api/ai-router/*
Provides:
  - CRUD for providers
  - OpenAI-compatible proxy  (/api/ai-router/v1/chat/completions)
  - Model listing            (/api/ai-router/v1/models)
  - Stats                    (/api/ai-router/stats)
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ai_router.engine import (
    add_provider,
    ai_complete,
    delete_provider,
    get_all_models,
    get_provider,
    get_providers,
    get_stats,
    seed_defaults,
    sync_provider_models,
    test_provider,
    update_provider,
)

logger = logging.getLogger("ai_router.router")

ai_router = APIRouter(prefix="/api/ai-router", tags=["AI Router"])


# ---------------------------------------------------------------------------
# Startup seed (called from server startup)
# ---------------------------------------------------------------------------

async def startup_seed():
    await seed_defaults()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str = ""
    description: str = ""
    priority: int = 99


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


# OpenAI-compatible
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = Field(default=1024, ge=1, le=32000)
    stream: bool = False
    system: Optional[str] = None


# ---------------------------------------------------------------------------
# Providers CRUD
# ---------------------------------------------------------------------------

@ai_router.get("/providers")
async def list_providers():
    """List all configured providers with stats."""
    providers = await get_providers()
    return {"providers": providers, "count": len(providers)}


@ai_router.post("/providers")
async def create_provider(body: ProviderCreate):
    """Add a new AI provider."""
    doc = await add_provider(body.model_dump())
    return doc


@ai_router.put("/providers/{provider_id}")
async def patch_provider(provider_id: str, body: ProviderUpdate):
    """Update a provider (toggle active, change priority, etc.)."""
    doc = await update_provider(provider_id, {k: v for k, v in body.model_dump().items() if v is not None})
    if not doc:
        raise HTTPException(status_code=404, detail="Provider not found")
    return doc


@ai_router.delete("/providers/{provider_id}")
async def remove_provider(provider_id: str):
    """Delete a provider."""
    p = await get_provider(provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    await delete_provider(provider_id)
    return {"deleted": provider_id}


@ai_router.post("/providers/{provider_id}/test")
async def test_provider_connection(provider_id: str):
    """Send a minimal test request to the provider."""
    result = await test_provider(provider_id)
    return result


@ai_router.post("/providers/{provider_id}/sync-models")
async def sync_models(provider_id: str):
    """Re-fetch the model list from the provider's /v1/models endpoint."""
    models = await sync_provider_models(provider_id)
    return {"provider_id": provider_id, "models": models, "count": len(models)}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@ai_router.get("/models")
async def list_all_models():
    """Return all models across active providers."""
    models = await get_all_models()
    return {"models": models, "count": len(models)}


# OpenAI-compatible model list
@ai_router.get("/v1/models")
async def openai_models():
    models = await get_all_models()
    return {
        "object": "list",
        "data": [
            {
                "id": m["id"],
                "object": "model",
                "owned_by": m["provider_id"],
                "created": 0,
            }
            for m in models
        ],
    }


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@ai_router.get("/stats")
async def router_stats():
    return await get_stats()


# ---------------------------------------------------------------------------
# OpenAI-compatible proxy (auto-fallback)
# ---------------------------------------------------------------------------

@ai_router.post("/v1/chat/completions")
async def proxy_chat_completions(body: ChatCompletionRequest):
    """
    OpenAI-compatible proxy endpoint.
    Routes to configured providers with auto-fallback.
    """
    if body.stream:
        raise HTTPException(status_code=400, detail="Streaming not supported via AI Router proxy")

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    result = await ai_complete(
        messages=messages,
        model=body.model,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        system=body.system,
    )

    if result is None:
        raise HTTPException(
            status_code=503,
            detail="All AI Router providers failed. Add a provider in the AI ROUTER panel.",
        )

    return {
        "id": f"airouter-{id(result)}",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": result},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
