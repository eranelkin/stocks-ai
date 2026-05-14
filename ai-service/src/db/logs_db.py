import logging
import sqlite3
from pathlib import Path

log = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "ai-service.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS audit_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    type         TEXT NOT NULL,
    model_id     TEXT,
    status       TEXT NOT NULL,
    duration_ms  INTEGER,
    search_query TEXT,
    error_msg    TEXT
)
"""

_CREATE_IDX_TS   = "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts)"
_CREATE_IDX_TYPE = "CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(type)"


def _conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_logs_db() -> None:
    with _conn() as conn:
        conn.execute(_CREATE_TABLE)
        conn.execute(_CREATE_IDX_TS)
        conn.execute(_CREATE_IDX_TYPE)
        conn.commit()


def insert_log(
    type: str,
    model_id: str | None,
    status: str,
    duration_ms: int | None = None,
    search_query: str | None = None,
    error_msg: str | None = None,
) -> None:
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO audit_logs (type, model_id, status, duration_ms, search_query, error_msg) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (type, model_id, status, duration_ms, search_query, error_msg),
            )
            conn.commit()
    except Exception:
        log.exception("insert_log failed — swallowing to avoid breaking request")


def list_logs(
    limit: int = 200,
    type_filter: str | None = None,
    model_id_filter: str | None = None,
) -> list[dict]:
    clauses = []
    params: list = []
    if type_filter:
        clauses.append("type = ?")
        params.append(type_filter)
    if model_id_filter:
        clauses.append("model_id = ?")
        params.append(model_id_filter)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params.append(limit)

    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM audit_logs {where} ORDER BY id DESC LIMIT ?",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def get_stats() -> dict:
    with _conn() as conn:
        total_24h = conn.execute(
            "SELECT COUNT(*) FROM audit_logs WHERE ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')"
        ).fetchone()[0]

        error_24h = conn.execute(
            "SELECT COUNT(*) FROM audit_logs WHERE status = 'error' "
            "AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')"
        ).fetchone()[0]

        avg_search_row = conn.execute(
            "SELECT AVG(duration_ms) FROM audit_logs WHERE type = 'search_chat' AND status = 'ok' "
            "AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')"
        ).fetchone()
        avg_search_ms = int(avg_search_row[0]) if avg_search_row[0] is not None else None

        slowest_row = conn.execute(
            "SELECT model_id FROM audit_logs WHERE type = 'search_chat' AND status = 'ok' "
            "AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') "
            "GROUP BY model_id ORDER BY AVG(duration_ms) DESC LIMIT 1"
        ).fetchone()
        slowest_model = slowest_row[0] if slowest_row else None

        per_model_rows = conn.execute(
            "SELECT model_id, COUNT(*) as total, "
            "SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors, "
            "AVG(CASE WHEN type='search_chat' AND status='ok' THEN duration_ms END) as avg_search_ms "
            "FROM audit_logs WHERE ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') "
            "GROUP BY model_id ORDER BY total DESC"
        ).fetchall()

    per_model = [
        {
            "model_id": r["model_id"],
            "total": r["total"],
            "errors": r["errors"],
            "avg_search_ms": int(r["avg_search_ms"]) if r["avg_search_ms"] is not None else None,
        }
        for r in per_model_rows
    ]

    return {
        "total_24h": total_24h,
        "error_24h": error_24h,
        "avg_search_ms": avg_search_ms,
        "slowest_model": slowest_model,
        "per_model": per_model,
    }


def clear_logs() -> int:
    with _conn() as conn:
        result = conn.execute("DELETE FROM audit_logs")
        conn.commit()
    return result.rowcount
