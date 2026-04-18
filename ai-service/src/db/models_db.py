"""
SQLite persistence layer for model configurations.

API keys are stored here but NEVER returned through public API responses —
only a derived `ready` boolean is exposed. All public query functions omit
the api_key column.
"""

import os
import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "ai-service.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS models (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT 'openai_compatible',
    base_url    TEXT NOT NULL DEFAULT '',
    api_key     TEXT NOT NULL DEFAULT '',
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
)
"""


def get_connection() -> sqlite3.Connection:
    """Opens a fresh WAL-mode connection. Call per operation — not thread-safe to share."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    """Creates the table and seeds from config if empty. Idempotent — safe on every restart."""
    with get_connection() as conn:
        conn.execute(_CREATE_TABLE)
        conn.commit()
        row = conn.execute("SELECT COUNT(*) FROM models").fetchone()
        if row[0] == 0:
            _seed_from_config(conn)


def _seed_from_config(conn: sqlite3.Connection) -> None:
    from config.models import MODELS

    for i, m in enumerate(MODELS):
        api_key = os.getenv(m.get("api_key_env", ""), "") or ""
        is_default = 1 if m.get("default") else (1 if i == 0 else 0)
        conn.execute(
            "INSERT OR IGNORE INTO models (id, name, provider, base_url, api_key, is_default) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (m["id"], m["name"], m.get("provider", "openai_compatible"),
             m.get("base_url", ""), api_key, is_default),
        )
    # Ensure exactly one default
    conn.execute(
        "UPDATE models SET is_default = 0 WHERE id NOT IN "
        "(SELECT id FROM models WHERE is_default = 1 ORDER BY rowid LIMIT 1)"
    )
    conn.commit()


def list_models() -> list[dict]:
    """Returns all models WITHOUT api_key. Maps is_default → default for client compat."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, provider, base_url, is_default, created_at FROM models ORDER BY rowid"
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "provider": r["provider"],
            "base_url": r["base_url"],
            "default": bool(r["is_default"]),
            "created_at": r["created_at"],
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
    with get_connection() as conn:
        if is_default:
            conn.execute("UPDATE models SET is_default = 0")
        conn.execute(
            "INSERT INTO models (id, name, provider, base_url, api_key, is_default) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (id, name, provider, base_url, api_key, 1 if is_default else 0),
        )
        conn.commit()
    return _get_safe(id)


def update_model(model_id: str, **kwargs) -> dict | None:
    """
    Partial update. Accepted kwargs: name, provider, base_url, api_key, is_default.
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
    if "api_key" in kwargs and kwargs["api_key"]:  # non-empty string only
        fields["api_key"] = kwargs["api_key"]
    if "is_default" in kwargs and kwargs["is_default"] is not None:
        fields["is_default"] = 1 if kwargs["is_default"] else 0

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
            "SELECT id, name, provider, base_url, is_default, created_at FROM models WHERE id = ?",
            (model_id,),
        ).fetchone()
    return {
        "id": row["id"],
        "name": row["name"],
        "provider": row["provider"],
        "base_url": row["base_url"],
        "default": bool(row["is_default"]),
        "created_at": row["created_at"],
    }
