"""
SQLite persistence layer for model configurations.

API keys are stored here but NEVER returned through public API responses —
only a derived `ready` boolean is exposed. All public query functions omit
the api_key column.
"""

import json
import os
import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "ai-service.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS models (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    provider             TEXT NOT NULL DEFAULT 'openai_compatible',
    base_url             TEXT NOT NULL DEFAULT '',
    api_key              TEXT NOT NULL DEFAULT '',
    is_default           INTEGER NOT NULL DEFAULT 0,
    is_active            INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    web_search           INTEGER,
    web_search_strategy  TEXT,
    extra_headers        TEXT,
    extra_params         TEXT
)
"""


def get_connection() -> sqlite3.Connection:
    """Opens a fresh WAL-mode connection. Call per operation — not thread-safe to share."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _migrate_db(conn: sqlite3.Connection) -> None:
    """Add new columns to existing installs. Idempotent — safe to run on every startup."""
    migrations = [
        "ALTER TABLE models ADD COLUMN web_search INTEGER",
        "ALTER TABLE models ADD COLUMN web_search_strategy TEXT",
        "ALTER TABLE models ADD COLUMN extra_headers TEXT",
        "ALTER TABLE models ADD COLUMN extra_params TEXT",
        "ALTER TABLE models ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.commit()


def _infer_strategy(m: dict) -> str | None:
    """Determine the web search strategy from a model config dict."""
    if not m.get("web_search"):
        return None
    if m.get("provider") == "anthropic":
        return "anthropic"
    # All OpenAI-compatible providers (including Gemini's compat endpoint) use Tavily function calling.
    # Gemini's native google_search tool only works on the native Gemini API, not the OpenAI compat layer.
    return "function_calling"


def init_db() -> None:
    """Creates the table and seeds from config if empty. Idempotent — safe on every restart."""
    with get_connection() as conn:
        conn.execute(_CREATE_TABLE)
        _migrate_db(conn)
        conn.commit()
        row = conn.execute("SELECT COUNT(*) FROM models").fetchone()
        if row[0] == 0:
            _seed_from_config(conn)
        else:
            _reseed_web_search_from_config(conn)


def _seed_from_config(conn: sqlite3.Connection) -> None:
    from config.models import MODELS

    for i, m in enumerate(MODELS):
        api_key = os.getenv(m.get("api_key_env", ""), "") or ""
        is_default = 1 if m.get("default") else (1 if i == 0 else 0)
        strategy = _infer_strategy(m)
        ws = 1 if m.get("web_search") else (0 if m.get("web_search") is False else None)
        conn.execute(
            "INSERT OR IGNORE INTO models "
            "(id, name, provider, base_url, api_key, is_default, web_search, web_search_strategy) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (m["id"], m["name"], m.get("provider", "openai_compatible"),
             m.get("base_url", ""), api_key, is_default, ws, strategy),
        )
    # Ensure exactly one default
    conn.execute(
        "UPDATE models SET is_default = 0 WHERE id NOT IN "
        "(SELECT id FROM models WHERE is_default = 1 ORDER BY rowid LIMIT 1)"
    )
    conn.commit()


def _reseed_web_search_from_config(conn: sqlite3.Connection) -> None:
    """On upgrade: sync web_search/web_search_strategy from config for all known models."""
    from config.models import MODELS

    for m in MODELS:
        strategy = _infer_strategy(m)
        ws = 1 if m.get("web_search") else (0 if m.get("web_search") is False else None)
        if ws is not None:
            conn.execute(
                "UPDATE models SET web_search = ?, web_search_strategy = ? WHERE id = ?",
                (ws, strategy, m["id"]),
            )
    conn.commit()


def list_models() -> list[dict]:
    """Returns all models WITHOUT api_key. Maps is_default → default, is_active → active."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, provider, base_url, is_default, is_active, created_at, "
            "web_search, web_search_strategy FROM models ORDER BY rowid"
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "provider": r["provider"],
            "base_url": r["base_url"],
            "default": bool(r["is_default"]),
            "active": bool(r["is_active"]),
            "created_at": r["created_at"],
            "web_search": r["web_search"],
            "web_search_strategy": r["web_search_strategy"],
        }
        for r in rows
    ]


def get_model_with_key(model_id: str) -> dict | None:
    """Returns the full model row including api_key. For internal LLM use only."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM models WHERE id = ?", (model_id,)).fetchone()
    return dict(row) if row else None


def create_model(
    id: str, name: str, provider: str, base_url: str, api_key: str, is_default: bool
) -> dict:
    """Inserts a new model. Raises sqlite3.IntegrityError if id already exists."""
    # Infer strategy from provider/base_url for new models added via UI
    strategy = _infer_strategy({"provider": provider, "base_url": base_url, "web_search": True})
    with get_connection() as conn:
        if is_default:
            conn.execute("UPDATE models SET is_default = 0")
        conn.execute(
            "INSERT INTO models (id, name, provider, base_url, api_key, is_default, web_search_strategy) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (id, name, provider, base_url, api_key, 1 if is_default else 0, strategy),
        )
        conn.commit()
    return _get_safe(id)


def update_model(model_id: str, **kwargs) -> dict | None:
    """
    Partial update. Accepted kwargs: name, provider, base_url, api_key, is_default,
    web_search, web_search_strategy, extra_headers (dict), extra_params (dict).
    api_key is skipped if None or empty string (preserves existing key).
    Returns safe row (no api_key) or None if not found.
    """
    if not get_model_with_key(model_id):
        return None

    fields = {}
    if "name" in kwargs and kwargs["name"] is not None:
        fields["name"] = kwargs["name"]
    if "provider" in kwargs and kwargs["provider"] is not None:
        fields["provider"] = kwargs["provider"]
    if "base_url" in kwargs and kwargs["base_url"] is not None:
        fields["base_url"] = kwargs["base_url"]
    if "api_key" in kwargs and kwargs["api_key"]:
        fields["api_key"] = kwargs["api_key"]
    if "is_default" in kwargs and kwargs["is_default"] is not None:
        fields["is_default"] = 1 if kwargs["is_default"] else 0
    if "web_search" in kwargs and kwargs["web_search"] is not None:
        fields["web_search"] = kwargs["web_search"]
    if "web_search_strategy" in kwargs:
        fields["web_search_strategy"] = kwargs["web_search_strategy"]
    if "extra_headers" in kwargs and kwargs["extra_headers"] is not None:
        fields["extra_headers"] = json.dumps(kwargs["extra_headers"])
    if "extra_params" in kwargs and kwargs["extra_params"] is not None:
        fields["extra_params"] = json.dumps(kwargs["extra_params"])
    if "is_active" in kwargs and kwargs["is_active"] is not None:
        fields["is_active"] = 1 if kwargs["is_active"] else 0

    if not fields:
        return _get_safe(model_id)

    with get_connection() as conn:
        if fields.get("is_default") == 1:
            conn.execute("UPDATE models SET is_default = 0")
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE models SET {set_clause} WHERE id = ?",
            (*fields.values(), model_id),
        )
        conn.commit()

    return _get_safe(model_id)


def delete_model(model_id: str) -> bool:
    """Deletes a model. Returns True if a row was deleted."""
    with get_connection() as conn:
        result = conn.execute("DELETE FROM models WHERE id = ?", (model_id,))
        conn.commit()
    return result.rowcount > 0


def _get_safe(model_id: str) -> dict:
    """Returns a model row without api_key. Maps is_default → default."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, provider, base_url, is_default, is_active, created_at, "
            "web_search, web_search_strategy, extra_headers, extra_params "
            "FROM models WHERE id = ?",
            (model_id,),
        ).fetchone()
    return {
        "id": row["id"],
        "name": row["name"],
        "provider": row["provider"],
        "base_url": row["base_url"],
        "default": bool(row["is_default"]),
        "active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "web_search": row["web_search"],
        "web_search_strategy": row["web_search_strategy"],
        "extra_headers": json.loads(row["extra_headers"]) if row["extra_headers"] else {},
        "extra_params": json.loads(row["extra_params"]) if row["extra_params"] else {},
    }
