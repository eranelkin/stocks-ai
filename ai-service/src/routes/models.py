import os

from fastapi import APIRouter

from config.models import MODELS

router = APIRouter()


@router.get("")
async def list_models():
    """
    Returns all configured models, marking which ones have their API key set.
    The UI uses this to build the dropdown and warn about missing keys.
    """
    return [
        {
            "id": m["id"],
            "name": m["name"],
            "provider": m["provider"],
            "default": m.get("default", False),
            "ready": bool(os.getenv(m["api_key_env"])),
        }
        for m in MODELS
    ]
