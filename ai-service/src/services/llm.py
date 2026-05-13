"""
LLM client factory and streaming chat.

Supports any OpenAI-compatible provider (xAI, OpenAI, Mistral, …) plus
Anthropic's native SDK. Search strategy is driven by per-model config.
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


async def create_stream(
    model_id: str,
    api_key: str,
    base_url: str,
    full_messages: list[dict],
    extra_headers: dict | None = None,
    extra_params: dict | None = None,
):
    """Opens the streaming request. Raises OpenAI errors before StreamingResponse starts."""
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=extra_headers or {},
    )
    log.info("→ POST %s/chat/completions  model=%s", base_url.rstrip('/'), model_id)
    return await client.chat.completions.create(
        model=model_id,
        messages=full_messages,
        stream=True,
        **(extra_params or {}),
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


async def prepare_search_stream(
    model_id: str,
    api_key: str,
    base_url: str,
    full_messages: list[dict],
    strategy: str,
    extra_headers: dict | None = None,
    extra_params: dict | None = None,
) -> AsyncGenerator[str, None]:
    """Dispatches to the correct search implementation based on strategy."""
    if strategy == "function_calling":
        return await _search_function_calling(
            model_id, api_key, base_url, full_messages, extra_headers, extra_params
        )
    elif strategy == "native_gemini":
        return await _search_native_gemini(
            model_id, api_key, base_url, full_messages, extra_headers, extra_params
        )
    elif strategy == "anthropic":
        return await _search_anthropic(
            model_id, api_key, full_messages, extra_headers, extra_params
        )
    else:
        raise ValueError(f"Unknown search strategy: {strategy!r}")


def _parse_xml_tool_call(error) -> dict | None:
    """
    Some models (e.g. Llama on Groq) generate <function=name(args)></function> format
    instead of proper OpenAI JSON tool calls, causing a 400. Extract the args from the
    failed_generation field so we can execute the tool manually.
    """
    import re
    try:
        body = getattr(error, "body", None) or {}
        failed_gen = (body.get("error", {}).get("failed_generation", "")
                      if isinstance(body, dict) else str(error))
        if not failed_gen:
            failed_gen = str(error)
        match = re.search(r"<function=(\w+)\((\{.*?\})\)</function>", failed_gen, re.DOTALL)
        if match:
            return {"name": match.group(1), "args": json.loads(match.group(2))}
    except Exception:
        pass
    return None


async def _search_function_calling(
    model_id: str,
    api_key: str,
    base_url: str,
    full_messages: list[dict],
    extra_headers: dict | None,
    extra_params: dict | None,
) -> AsyncGenerator[str, None]:
    """
    Two-phase: non-streaming first call detects web_search tool calls via Tavily,
    then streams the final answer with search results in context.

    Falls back to manual XML-style tool call parsing for models (e.g. Llama on Groq)
    that generate <function=name(args)> format instead of proper JSON tool calls.
    """
    from services.search import WEB_SEARCH_TOOL, execute_tool_calls, web_search as _tavily_search

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=extra_headers or {},
    )
    messages = list(full_messages)

    log.info("→ POST %s/chat/completions (function_calling) model=%s", base_url.rstrip('/'), model_id)

    try:
        response = await client.chat.completions.create(
            model=model_id,
            messages=messages,
            tools=[WEB_SEARCH_TOOL],
            tool_choice="auto",
            stream=False,
            **(extra_params or {}),
        )
    except Exception as e:
        # Groq/Llama sometimes generates <function=name(args)> XML format that the API rejects.
        # Parse it manually and inject search results as context for a follow-up call.
        parsed = _parse_xml_tool_call(e)
        if parsed and parsed["name"] == "web_search":
            query = parsed["args"].get("query", "")
            log.info("XML tool call fallback: web_search query=%r", query)
            search_result = _tavily_search(query)
            injected = messages + [{
                "role": "user",
                "content": f"[Web search results for '{query}']\n\n{search_result}",
            }]
            stream = await client.chat.completions.create(
                model=model_id,
                messages=injected,
                stream=True,
                **(extra_params or {}),
            )
            return iterate_stream(stream)
        raise

    choice = response.choices[0]

    if choice.finish_reason != "tool_calls":
        content = choice.message.content or ""

        async def _direct() -> AsyncGenerator[str, None]:
            yield f"data: {json.dumps({'content': content})}\n\n"
            yield "data: [DONE]\n\n"

        return _direct()

    messages.append(choice.message.model_dump(exclude_none=True))
    messages.extend(execute_tool_calls(choice.message.tool_calls))

    stream = await client.chat.completions.create(
        model=model_id,
        messages=messages,
        stream=True,
        **(extra_params or {}),
    )
    return iterate_stream(stream)


async def _search_native_gemini(
    model_id: str,
    api_key: str,
    base_url: str,
    full_messages: list[dict],
    extra_headers: dict | None,
    extra_params: dict | None,
) -> AsyncGenerator[str, None]:
    """Gemini's built-in Google Search grounding — single streaming call, no Tavily."""
    from services.search import GEMINI_SEARCH_TOOL

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=extra_headers or {},
    )
    log.info("→ POST %s/chat/completions (native_gemini) model=%s", base_url.rstrip('/'), model_id)
    stream = await client.chat.completions.create(
        model=model_id,
        messages=full_messages,
        tools=[GEMINI_SEARCH_TOOL],
        stream=True,
        **(extra_params or {}),
    )
    return iterate_stream(stream)


async def _search_anthropic(
    model_id: str,
    api_key: str,
    full_messages: list[dict],
    extra_headers: dict | None,
    extra_params: dict | None,
) -> AsyncGenerator[str, None]:
    """Anthropic's native web search tool via the Anthropic SDK."""
    import anthropic as anthropic_sdk
    from services.search import ANTHROPIC_SEARCH_TOOL

    client = anthropic_sdk.AsyncAnthropic(
        api_key=api_key,
        default_headers=extra_headers or {},
    )
    system_msg, conv_messages = _split_anthropic_messages(full_messages)

    log.info("→ Anthropic messages.stream (anthropic) model=%s", model_id)

    async def _stream() -> AsyncGenerator[str, None]:
        async with client.messages.stream(
            model=model_id,
            max_tokens=4096,
            system=system_msg,
            messages=conv_messages,
            tools=[ANTHROPIC_SEARCH_TOOL],
            **(extra_params or {}),
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'content': text})}\n\n"
        yield "data: [DONE]\n\n"

    return _stream()


def _split_anthropic_messages(messages: list[dict]) -> tuple[str, list[dict]]:
    """Separate system prompt from conversation; collapse consecutive same-role messages."""
    system = ""
    conv: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
            continue
        if conv and conv[-1]["role"] == m["role"]:
            # Anthropic requires strict alternation — merge consecutive same-role messages
            conv[-1] = {**conv[-1], "content": conv[-1]["content"] + "\n\n" + m["content"]}
        else:
            conv.append({"role": m["role"], "content": m["content"]})
    return system, conv
