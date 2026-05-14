import json
import logging
import os
import time
from contextvars import ContextVar

log = logging.getLogger(__name__)

_cv_search_query: ContextVar[str | None] = ContextVar("search_query", default=None)
_cv_search_ms: ContextVar[int | None] = ContextVar("search_ms", default=None)


def get_search_context() -> tuple[str | None, int | None]:
    return _cv_search_query.get(), _cv_search_ms.get()

GEMINI_SEARCH_TOOL = {"googleSearch": {}}

ANTHROPIC_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 5,
}

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the web for current information: stock prices, earnings reports, "
            "news, financial data, analyst ratings, or any real-time information."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
            },
            "required": ["query"],
        },
    },
}


def web_search(query: str, max_results: int = 5) -> str:
    from tavily import TavilyClient

    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is not set")

    log.info("web_search query=%r", query)
    _cv_search_query.set(query)
    client = TavilyClient(api_key=api_key)
    t0 = time.perf_counter()
    response = client.search(query=query, max_results=max_results)
    _cv_search_ms.set(int((time.perf_counter() - t0) * 1000))
    results = response.get("results", [])
    if not results:
        return "No results found."

    lines = []
    for r in results:
        lines.append(f"**{r['title']}** ({r['url']})\n{r['content']}")
    return "\n\n".join(lines)


def execute_tool_calls(tool_calls) -> list[dict]:
    """Run each tool call and return tool-role messages."""
    results = []
    for tc in tool_calls:
        if tc.function.name == "web_search":
            args = json.loads(tc.function.arguments)
            content = web_search(args.get("query", ""))
        else:
            content = f"Unknown tool: {tc.function.name}"
        results.append({"role": "tool", "tool_call_id": tc.id, "content": content})
    return results
