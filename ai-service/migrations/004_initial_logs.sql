CREATE TABLE IF NOT EXISTS audit_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    type         TEXT NOT NULL,
    model_id     TEXT,
    status       TEXT NOT NULL,
    duration_ms  INTEGER,
    search_query TEXT,
    error_msg    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts   ON audit_logs(ts);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(type);
