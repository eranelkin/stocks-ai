from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health():
    return {
        "status": "ok",
        "service": "stocks-ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "0.1.0",
    }
