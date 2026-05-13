import asyncio
import json
import logging
import sqlite3

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from db.models_db import (
    _infer_strategy,
    create_model,
    delete_model,
    get_model_with_key,
    list_models,
    update_model,
)

log = logging.getLogger(__name__)

router = APIRouter()


class ModelCreate(BaseModel):
    id: str
    name: str
    provider: str = "openai_compatible"
    base_url: str
    api_key: str
    is_default: bool = False


class ModelUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    base_url: str | None = None
    api_key: str | None = None   # None or empty = keep existing key
    is_default: bool | None = None
    web_search: int | None = None
    web_search_strategy: str | None = None
    extra_headers: dict | None = None
    extra_params: dict | None = None


def _with_ready(row: dict) -> dict:
    """Attaches ready flag by checking api_key in DB. api_key itself never returned."""
    full = get_model_with_key(row["id"])
    return {
        **row,
        "ready": bool(full and full.get("api_key")),
    }


@router.get("")
async def get_models():
    """
    Returns all configured models with a `ready` flag (api_key is set).
    The api_key itself is never included in the response.
    """
    return [_with_ready(r) for r in list_models()]


@router.post("", status_code=201)
async def add_model(body: ModelCreate):
    if not body.id.strip():
        raise HTTPException(status_code=400, detail="id is required")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if not body.base_url.strip():
        raise HTTPException(status_code=400, detail="base_url is required")
    if not body.api_key.strip():
        raise HTTPException(status_code=400, detail="api_key is required")

    try:
        row = create_model(
            id=body.id.strip(),
            name=body.name.strip(),
            provider=body.provider.strip() or "openai_compatible",
            base_url=body.base_url.strip(),
            api_key=body.api_key,
            is_default=body.is_default,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail=f"Model '{body.id}' already exists")

    return _with_ready(row)


@router.put("/{model_id}")
async def edit_model(model_id: str, body: ModelUpdate):
    row = update_model(
        model_id,
        name=body.name,
        provider=body.provider,
        base_url=body.base_url,
        api_key=body.api_key,
        is_default=body.is_default,
        web_search=body.web_search,
        web_search_strategy=body.web_search_strategy,
        extra_headers=body.extra_headers,
        extra_params=body.extra_params,
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return _with_ready(row)


@router.delete("/{model_id}", status_code=204)
async def remove_model(model_id: str):
    if not delete_model(model_id):
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return Response(status_code=204)


# ─── Probe ────────────────────────────────────────────────────────────────────

async def _probe_one_model(row: dict) -> dict:
    """
    Tests web search capability for a single model.
    Returns {"id", "success", "strategy", "error"}.
    """
    from services.llm import prepare_search_stream

    model_id = row["id"]
    api_key = row.get("api_key", "")
    base_url = row.get("base_url") or ""

    # Always re-infer strategy from current config so stale DB values don't cause failures
    from config.models import _index as models_index
    config_entry = models_index.get(model_id) or {
        "provider": row.get("provider", ""),
        "base_url": base_url,
        "web_search": True,
    }
    strategy = _infer_strategy(config_entry)

    if not strategy:
        return {"id": model_id, "success": False, "strategy": None, "error": "Cannot infer strategy"}

    test_messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Search the web for the current Bitcoin price."},
    ]

    extra_headers = json.loads(row["extra_headers"]) if row.get("extra_headers") else {}
    extra_params  = json.loads(row["extra_params"])  if row.get("extra_params")  else {}

    try:
        async def _run():
            gen = await prepare_search_stream(
                model_id, api_key, base_url, test_messages,
                strategy=strategy,
                extra_headers=extra_headers,
                extra_params=extra_params,
            )
            collected = ""
            async for chunk in gen:
                if chunk.startswith("data: ") and chunk.strip() != "data: [DONE]":
                    try:
                        data = json.loads(chunk[6:])
                        collected += data.get("content", "")
                    except Exception:
                        pass
                if len(collected) > 200:
                    break
            return collected

        collected = await asyncio.wait_for(_run(), timeout=30.0)
        success = len(collected) > 20
        return {
            "id": model_id,
            "success": success,
            "strategy": strategy if success else None,
            "error": None if success else "Response too short — search may have failed",
        }
    except asyncio.TimeoutError:
        return {"id": model_id, "success": False, "strategy": None, "error": "Timed out after 30s"}
    except Exception as e:
        return {"id": model_id, "success": False, "strategy": None, "error": str(e)}


@router.post("/probe-web-search")
async def probe_web_search():
    """
    Tests web search capability for all ready models in chunks of 3.
    Updates web_search and web_search_strategy in DB. Returns per-model results.
    """
    all_models = list_models()
    ready = [get_model_with_key(m["id"]) for m in all_models]
    ready = [r for r in ready if r and r.get("api_key")]

    CHUNK_SIZE = 3
    results = []

    for i in range(0, len(ready), CHUNK_SIZE):
        chunk = ready[i : i + CHUNK_SIZE]
        chunk_results = await asyncio.gather(*[_probe_one_model(r) for r in chunk])
        for res in chunk_results:
            update_model(
                res["id"],
                web_search=1 if res["success"] else 0,
                web_search_strategy=res["strategy"],
            )
            results.append(res)

    return {"results": results}
