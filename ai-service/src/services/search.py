import json
import logging
import os

log = logging.getLogger(__name__)

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
    client = TavilyClient(api_key=api_key)
    response = client.search(query=query, max_results=max_results)
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
