"""
LLM client factory and streaming chat.

Supports any OpenAI-compatible provider (xAI, OpenAI, Mistral, …).
Anthropic can be added here by checking provider == "anthropic" and using
the Anthropic SDK instead.
"""

import json
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from db.models_db import get_model_with_key

SYSTEM_PROMPT = """You are an expert stock market analyst and financial advisor.
You help users analyze stocks, evaluate risk, understand market trends, and build
better investment theses. For each analysis you provide:
- A probability assessment for the trade thesis (e.g. win probability %)
- Key supporting and opposing factors
- Important risk parameters
- Clear uncertainty communication when data is insufficient

You also help the user improve their prompts and analysis frameworks over time."""


def _get_client(model_id: str) -> AsyncOpenAI:
    row = get_model_with_key(model_id)
    if not row:
        raise KeyError(f"Unknown model '{model_id}'")
    if not row.get("api_key"):
        raise EnvironmentError(f"API key not configured for model '{model_id}'")
    return AsyncOpenAI(api_key=row["api_key"], base_url=row["base_url"])


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


async def stream_chat(
    model_id: str,
    messages: list[dict],
    attachments: list[dict] | None = None,
    system_prompt: str = SYSTEM_PROMPT,
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-formatted strings.
    Each data event: data: {"content": "<token>"}\n\n
    Final event:     data: [DONE]\n\n
    """
    client = _get_client(model_id)

    enriched = _inject_attachments(messages, attachments or [])
    full_messages = [{"role": "system", "content": system_prompt}, *enriched]

    stream = await client.chat.completions.create(
        model=model_id,
        messages=full_messages,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield f"data: {json.dumps({'content': delta.content})}\n\n"

    yield "data: [DONE]\n\n"
