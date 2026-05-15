CREATE TABLE IF NOT EXISTS prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    text        TEXT    NOT NULL,
    attachments TEXT    NOT NULL DEFAULT '[]',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT    NOT NULL,
    columns             TEXT    NOT NULL DEFAULT '[]',
    rows                TEXT    NOT NULL DEFAULT '[]',
    source_prompt_title TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
