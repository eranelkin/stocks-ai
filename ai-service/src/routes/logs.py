from fastapi import APIRouter
from fastapi.responses import Response

from db.logs_db import clear_logs, get_stats, list_logs

router = APIRouter()


@router.get("")
async def get_logs(limit: int = 200, type: str | None = None, model_id: str | None = None):
    return list_logs(limit=limit, type_filter=type, model_id_filter=model_id)


@router.get("/stats")
async def get_log_stats():
    return get_stats()


@router.delete("", status_code=204)
async def delete_logs():
    clear_logs()
    return Response(status_code=204)
