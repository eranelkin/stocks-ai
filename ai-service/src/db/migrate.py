import logging
import sqlite3
from pathlib import Path

log = logging.getLogger(__name__)

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply all pending .sql migration files in order. Idempotent — safe on every startup."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()

    applied = {row[0] for row in conn.execute("SELECT filename FROM schema_migrations")}

    for filepath in sorted(_MIGRATIONS_DIR.glob("*.sql")):
        filename = filepath.name
        if filename in applied:
            continue

        statements = [s.strip() for s in filepath.read_text().split(";") if s.strip()]
        try:
            for stmt in statements:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    # Column already exists on a DB that predates the migration system — skip
                    if "duplicate column name" in str(e).lower():
                        continue
                    raise
            conn.execute("INSERT INTO schema_migrations (filename) VALUES (?)", (filename,))
            conn.commit()
            log.info("migration applied: %s", filename)
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Migration {filename} failed: {e}") from e
