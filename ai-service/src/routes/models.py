import sqlite3

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from db.models_db import create_model, delete_model, get_model_with_key, list_models, update_model

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


def _with_ready(row: dict) -> dict:
    """Attaches ready flag by checking api_key in DB. api_key itself never returned."""
    full = get_model_with_key(row["id"])
    return {**row, "ready": bool(full and full.get("api_key"))}


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
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return _with_ready(row)


@router.delete("/{model_id}", status_code=204)
async def remove_model(model_id: str):
    if not delete_model(model_id):
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return Response(status_code=204)
