import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import openai

log = logging.getLogger(__name__)

from db.models_db import get_model_with_key
from services.llm import build_messages, create_stream, iterate_stream, prepare_search_stream

router = APIRouter()


class Message(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class Attachment(BaseModel):
    name: str
    content: str  # file text content (read client-side)
    mime_type: str = "text/plain"


class ChatRequest(BaseModel):
    model: str
    messages: list[Message]
    attachments: list[Attachment] = []
    system_prompt: str | None = None
    enable_web_search: bool = False


@router.post("")
async def chat(req: ChatRequest):
    row = get_model_with_key(req.model)
    if not row:
        raise HTTPException(status_code=400, detail=f"Unknown model '{req.model}'")
    if not row.get("api_key"):
        raise HTTPException(status_code=503, detail=f"API key not configured for model '{req.model}'")

    strategy = row.get("web_search_strategy")

    if req.enable_web_search:
        ws = row.get("web_search")      # None=unknown, 0=no, 1=yes
        if ws == 0 or not strategy:
            raise HTTPException(
                status_code=400,
                detail=f"Model '{req.model}' does not support web search. "
                       f"Run Probe Web Search on the Models page to detect capabilities.",
            )

    extra_headers = json.loads(row["extra_headers"]) if row.get("extra_headers") else {}
    extra_params  = json.loads(row["extra_params"])  if row.get("extra_params")  else {}

    full_messages = build_messages(
        messages=[m.model_dump() for m in req.messages],
        attachments=[a.model_dump() for a in req.attachments],
        **({"system_prompt": req.system_prompt} if req.system_prompt else {}),
    )

    try:
        if req.enable_web_search:
            generator = await prepare_search_stream(
                req.model, row["api_key"], row.get("base_url") or "",
                full_messages, strategy=strategy,
                extra_headers=extra_headers, extra_params=extra_params,
            )
        else:
            stream = await create_stream(
                req.model, row["api_key"], row.get("base_url") or "",
                full_messages, extra_headers=extra_headers, extra_params=extra_params,
            )
            generator = iterate_stream(stream)
    except openai.RateLimitError as e:
        log.warning("Rate limit: %s", e)
        raise HTTPException(status_code=429, detail=str(e))
    except openai.AuthenticationError as e:
        log.warning("Auth error for model %s: %s", req.model, e)
        raise HTTPException(status_code=401, detail=str(e))
    except openai.OpenAIError as e:
        log.error("OpenAI error for model %s: %s", req.model, e)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        log.error("Unexpected error for model %s: %s", req.model, e)
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(generator, media_type="text/event-stream")
