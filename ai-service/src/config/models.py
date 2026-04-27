"""
Model registry — add new models here, no other code changes needed.

Each entry must have:
  id          — model identifier sent to the provider API
  name        — display name shown in the UI dropdown
  provider    — "openai_compatible" | "anthropic" (drives which SDK client is used)
  base_url    — API base URL (OpenAI-compatible providers only)
  api_key_env — name of the env var that holds the API key
  default     — (optional) True to pre-select this model in the UI

To add a new model, append an entry to MODELS and set the matching env var in .env.
"""

MODELS: list[dict] = [
    # --- Groq (free tier) — get a key at console.groq.com ---
    {
        "id": "llama-3.3-70b-versatile",
        "name": "Llama 3.3 70B (Groq)",
        "provider": "openai_compatible",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "default": True,
    },
    {
        "id": "llama-3.1-8b-instant",
        "name": "Llama 3.1 8B Instant (Groq)",
        "provider": "openai_compatible",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
    },
    # --- Google Gemini (free tier) — get a key at aistudio.google.com ---
    {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash (Google)",
        "provider": "openai_compatible",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
    },
    {
        "id": "gemini-2.5-flash-lite",
        "name": "Gemini 2.5 Flash Lite (Google)",
        "provider": "openai_compatible",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
    },
    {
        "id": "gemini-1.5-flash-8b",
        "name": "Gemini 1.5 Flash 8B (Google)",
        "provider": "openai_compatible",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
    },
    # --- Future models: just uncomment and set the matching env var ---
    # {
    #     "id": "gpt-4o",
    #     "name": "GPT-4o",
    #     "provider": "openai_compatible",
    #     "base_url": "https://api.openai.com/v1",
    #     "api_key_env": "OPENAI_API_KEY",
    # },
    # {
    #     "id": "claude-opus-4-6",
    #     "name": "Claude Opus 4.6",
    #     "provider": "anthropic",
    #     "base_url": None,
    #     "api_key_env": "ANTHROPIC_API_KEY",
    # },
]

_index: dict[str, dict] = {m["id"]: m for m in MODELS}


def get_model(model_id: str) -> dict:
    if model_id not in _index:
        raise KeyError(f"Unknown model '{model_id}'")
    return _index[model_id]


def get_default_model() -> dict:
    for m in MODELS:
        if m.get("default"):
            return m
    return MODELS[0]
