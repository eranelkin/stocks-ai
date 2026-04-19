"""
LLM client factory and streaming chat.

Supports any OpenAI-compatible provider (xAI, OpenAI, Mistral, …).
Anthropic can be added here by checking provider == "anthropic" and using
the Anthropic SDK instead.
"""

import json
import logging
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert stock market analyst and financial advisor.
You help users analyze stocks, evaluate risk, understand market trends, and build
better investment theses. For each analysis you provide:
- A probability assessment for the trade thesis (e.g. win probability %)
- Key supporting and opposing factors
- Important risk parameters
- Clear uncertainty communication when data is insufficient

You also help the user improve their prompts and analysis frameworks over time."""


def _build_attachment_block(attachments: list[dict]) -> str:
    """Formats attachments as a fenced code block section appended to a user message."""
    lines = ["\n\n---\nAttached files:"]
    for att in attachments:
        # Pick a fence language hint from the mime type (e.g. application/json → json)
        lang = att.get("mime_type", "").split("/")[-1].replace("x-", "")
        lines.append(f'\n**{att["name"]}**\n```{lang}\n{att["content"]}\n```')
    return "\n".join(lines)


def _inject_attachments(messages: list[dict], attachments: list[dict]) -> list[dict]:
    """Appends attachment content to the last user message in the list."""
    if not attachments:
        return messages

    block = _build_attachment_block(attachments)
    result = list(messages)

    for i in range(len(result) - 1, -1, -1):
        if result[i]["role"] == "user":
            result[i] = {**result[i], "content": result[i]["content"] + block}
            break

    return result


def build_messages(
    messages: list[dict],
    attachments: list[dict] | None = None,
    system_prompt: str = SYSTEM_PROMPT,
) -> list[dict]:
    enriched = _inject_attachments(messages, attachments or [])
    return [{"role": "system", "content": system_prompt}, *enriched]


async def create_stream(model_id: str, api_key: str, base_url: str, full_messages: list[dict]):
    """Opens the streaming request. Raises OpenAI errors before StreamingResponse starts."""
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    log.info("→ POST %s/chat/completions  model=%s", base_url.rstrip('/'), model_id)
    return await client.chat.completions.create(
        model=model_id,
        messages=full_messages,
        stream=True,
    )


async def iterate_stream(stream) -> AsyncGenerator[str, None]:
    """Yields SSE strings from an already-opened stream. No I/O errors expected here."""
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta.content:
            yield f"data: {json.dumps({'content': delta.content})}\n\n"
    yield "data: [DONE]\n\n"
