from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.llm import stream_chat

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


@router.post("")
async def chat(req: ChatRequest):
    kwargs = {
        "model_id": req.model,
        "messages": [m.model_dump() for m in req.messages],
        "attachments": [a.model_dump() for a in req.attachments],
    }
    if req.system_prompt:
        kwargs["system_prompt"] = req.system_prompt

    try:
        generator = stream_chat(**kwargs)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return StreamingResponse(generator, media_type="text/event-stream")
