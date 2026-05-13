# Migrate from SQLite to PostgreSQL on Docker

## Context

The project currently has **two separate SQLite files**:

- `data/stocks-ai.db` — Node.js server (`prompts`, `reports` tables)
- `data/ai-service.db` — Python ai-service (`models` table)

Both use raw SQL with no ORM. This plan replaces both with a **single PostgreSQL instance running in Docker**. The three app services (client, server, ai-service) continue running locally — only the database moves to Docker.

### Why PostgreSQL is better here

- **Unified database** — one instance instead of two separate files
- **One-command startup** — `docker-compose up -d` replaces manual file management
- **Robust concurrency** — PG handles concurrent writes from Node + Python without WAL file contention
- **JSONB columns** — `attachments`, `columns`, `rows`, `model_results` become validated, indexable JSON instead of raw TEXT strings
- **Production-ready** — no database changes needed when eventually deploying

**Trade-off:** Requires Docker running. SQLite was fine for single-user local dev, but this makes the project deployable and eliminates the two-DB split.

---

## Files to Create

| File                                 | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| `docker-compose.yml` (repo root)     | PostgreSQL 16 service with named volume    |
| `db/init.sql`                        | DDL for all 3 tables in PostgreSQL syntax  |
| `server/.env`                        | `DATABASE_URL` for the Node server         |
| `migrate.py` _(optional, repo root)_ | One-shot SQLite → PG data migration script |

## Files to Modify

| File                              | Change                                                                      |
| --------------------------------- | --------------------------------------------------------------------------- |
| `server/.gitignore`               | Add `.env`                                                                  |
| `server/package.json`             | Add `pg`, `dotenv`; remove `better-sqlite3`                                 |
| `server/src/db/index.js`          | Replace `better-sqlite3` singleton with `pg.Pool`                           |
| `server/src/routes/prompts.js`    | Sync → async, `?` → `$N`, `RETURNING *`, remove manual JSON parse/stringify |
| `server/src/routes/reports.js`    | Same as prompts.js                                                          |
| `ai-service/.env`                 | Add `DATABASE_URL`                                                          |
| `ai-service/requirements.txt`     | Add `psycopg2-binary`                                                       |
| `ai-service/src/db/models_db.py`  | `sqlite3` → `psycopg2`, `%s` placeholders, cursor pattern                   |
| `ai-service/src/routes/models.py` | `sqlite3.IntegrityError` → `psycopg2.errors.UniqueViolation`                |

---

## Step-by-Step Implementation

### 1. `docker-compose.yml` (repo root)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: stocks-ai-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: stocks_ai
      POSTGRES_USER: stocks_ai
      POSTGRES_PASSWORD: stocks_ai_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro

volumes:
  postgres_data:
```

- Port 5432 is exposed on localhost so both local services can connect via `localhost:5432`.
- The named volume `postgres_data` survives `docker-compose down`; data is only wiped with `docker-compose down -v`.
- `init.sql` is mounted into the initdb directory and **runs only once** — on the very first `docker-compose up` when the volume is empty.

---

### 2. `db/init.sql`

```sql
-- Runs once on first docker-compose up (when the volume is empty).

CREATE TABLE IF NOT EXISTS prompts (
    id          SERIAL      PRIMARY KEY,
    title       TEXT        NOT NULL,
    text        TEXT        NOT NULL,
    attachments JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category    TEXT        NOT NULL DEFAULT 'personal'
);

CREATE TABLE IF NOT EXISTS reports (
    id                  SERIAL      PRIMARY KEY,
    title               TEXT        NOT NULL,
    columns             JSONB       NOT NULL DEFAULT '[]',
    rows                JSONB       NOT NULL DEFAULT '[]',
    source_prompt_title TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_results       JSONB       DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS models (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    provider    TEXT        NOT NULL DEFAULT 'openai_compatible',
    base_url    TEXT        NOT NULL DEFAULT '',
    api_key     TEXT        NOT NULL DEFAULT '',
    is_default  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Type translation from SQLite:**

| SQLite                              | PostgreSQL                    | Reason                                              |
| ----------------------------------- | ----------------------------- | --------------------------------------------------- |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY`          | PG's auto-increment equivalent                      |
| `TEXT NOT NULL DEFAULT '[]'` (JSON) | `JSONB NOT NULL DEFAULT '[]'` | Binary JSON — validated on insert, indexable        |
| `datetime('now')`                   | `NOW()`                       | PG timestamp function                               |
| `TEXT` (timestamps)                 | `TIMESTAMPTZ`                 | Proper timestamp with time zone                     |
| `models.id TEXT PRIMARY KEY`        | unchanged                     | IDs are strings (e.g., `"llama-3.3-70b-versatile"`) |

---

### 3. Environment variables

Both services need `DATABASE_URL`. Add to each:

**`server/.env`** _(create new)_

```
DATABASE_URL=postgresql://stocks_ai:stocks_ai_dev@localhost:5432/stocks_ai
```

**`ai-service/.env`** _(append)_

```
DATABASE_URL=postgresql://stocks_ai:stocks_ai_dev@localhost:5432/stocks_ai
```

Also add `.env` to `server/.gitignore` — the root `.gitignore` already covers `ai-service/.env`.

---

### 4. `server/package.json`

```bash
cd server && yarn add pg dotenv && yarn remove better-sqlite3
```

---

### 5. `server/src/db/index.js` — Replace entirely

```js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Fail fast on startup if PG is unreachable
pool.query("SELECT 1").catch((err) => {
  console.error("PostgreSQL connection failed:", err.message);
  process.exit(1);
});

module.exports = pool;
```

Schema creation is removed — `init.sql` owns it now. The singleton `db` becomes a `pg.Pool` because pg is async and every `pool.query()` borrows a connection.

---

### 6. `server/src/routes/prompts.js` — Key changes

- All route handlers become `async`, wrapped in `try/catch`
- `db.prepare('...').all(cat)` → `const { rows } = await pool.query('...', [cat])`
- `?` placeholders → `$1, $2, ...`
- `db.prepare().run()` + separate SELECT → single `INSERT ... RETURNING *` or `UPDATE ... RETURNING *`
- `result.changes === 0` → `rowCount === 0`
- Remove `JSON.stringify(attachments)` on write — pg serializes JSONB automatically
- Remove `JSON.parse(row.attachments)` on read — pg deserializes JSONB automatically
- `datetime('now')` → `NOW()`
- PUT: collapse the pre-check SELECT + UPDATE into one `UPDATE ... RETURNING *` (zero rows returned → 404)

```js
// Example: GET all prompts (before → after)

// BEFORE (sync, better-sqlite3)
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM prompts WHERE category = ?")
    .all(category);
  res.json(rows.map(parsePrompt));
});

// AFTER (async, pg)
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM prompts WHERE category = $1 ORDER BY created_at DESC",
      [category],
    );
    res.json(rows); // JSONB already deserialized by pg
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});
```

```js
// Example: POST (RETURNING replaces lastInsertRowid)

// BEFORE
const result = db.prepare('INSERT INTO prompts ...').run(...);
const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid);

// AFTER (one round-trip)
const { rows } = await pool.query(
  'INSERT INTO prompts (title, text, attachments, category) VALUES ($1, $2, $3, $4) RETURNING *',
  [title, text, attachments, cat],   // pass JS array directly for JSONB
);
res.status(201).json(rows[0]);
```

---

### 7. `server/src/routes/reports.js` — Same pattern as prompts.js

Same changes: async handlers, `$N` params, `RETURNING *`, JSONB auto-serialized.

Watch for the variable name collision in the POST handler — the route body has a field also called `rows`. Destructure the pg result differently:

```js
const { rows: inserted } = await pool.query('INSERT INTO reports ... RETURNING *', [...]);
res.status(201).json(inserted[0]);
```

---

### 8. `ai-service/requirements.txt`

Add `psycopg2-binary` (self-contained wheel, no system libpq needed):

```
fastapi
uvicorn[standard]
openai
python-dotenv
tavily-python
psycopg2-binary
```

Install: `.venv/bin/pip install psycopg2-binary`

---

### 9. `ai-service/src/db/models_db.py` — Key changes

- `sqlite3.connect(path)` → `psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=psycopg2.extras.RealDictCursor)`
- `conn.row_factory = sqlite3.Row` removed — `RealDictCursor` gives the same `row["column"]` access
- Remove `PRAGMA journal_mode=WAL` — irrelevant to PG
- `?` → `%s` everywhere (psycopg2 uses `%s` for all parameter types)
- `INSERT OR IGNORE` → `INSERT ... ON CONFLICT (id) DO NOTHING`
- `ORDER BY rowid` → `ORDER BY created_at` (PG has no user-accessible rowid)
- Use `with conn.cursor() as cur:` + explicit `conn.commit()` for write operations
- `cur.rowcount` replaces `result.rowcount` (attribute is on the cursor, not the connection)
- `created_at` returns as a Python `datetime` object — call `.isoformat()` before returning in JSON

```python
# Connection (before → after)

# BEFORE
conn = sqlite3.connect(str(_DB_PATH))
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA journal_mode=WAL")

# AFTER
import psycopg2, psycopg2.extras
conn = psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=psycopg2.extras.RealDictCursor)
```

```python
# INSERT OR IGNORE → ON CONFLICT DO NOTHING
cur.execute(
    "INSERT INTO models (id, name, provider, base_url, api_key, is_default) "
    "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
    (m["id"], m["name"], ...),
)
```

```python
# created_at serialization
"created_at": row["created_at"].isoformat(),   # datetime → "2025-01-01T12:00:00+00:00"
```

> **psycopg2 context manager note:** `with psycopg2.connect(...) as conn` manages the _transaction_ only (not the connection lifecycle). Always call `conn.commit()` explicitly inside the `with` block for writes.

---

### 10. `ai-service/src/routes/models.py` — One-line change

```python
# Remove:
import sqlite3

# Add:
import psycopg2

# Change (line 64):
except sqlite3.IntegrityError:
# To:
except psycopg2.errors.UniqueViolation:
```

---

## Key Gotchas Reference

| Issue                   | SQLite                                 | PostgreSQL                                              |
| ----------------------- | -------------------------------------- | ------------------------------------------------------- |
| Query placeholders      | `?`                                    | `$1, $2...` (Node `pg`) / `%s` (Python `psycopg2`)      |
| Insert + fetch back     | Two queries via `lastInsertRowid`      | One query: `INSERT ... RETURNING *`                     |
| Ignore duplicate        | `INSERT OR IGNORE`                     | `INSERT ... ON CONFLICT (id) DO NOTHING`                |
| JSON columns            | Manual `JSON.stringify` / `JSON.parse` | Automatic — pass/receive native JS or Python objects    |
| Row ordering            | `ORDER BY rowid`                       | `ORDER BY created_at`                                   |
| Timestamps              | `TEXT` string                          | `datetime` object → `.isoformat()`                      |
| Bulk insert sequences   | N/A                                    | Run `setval('prompts_id_seq', MAX(id))` after migration |
| Exception type (Python) | `sqlite3.IntegrityError`               | `psycopg2.errors.UniqueViolation`                       |

---

## Optional: Data Migration (`migrate.py`)

Skip this if you're happy starting fresh. If you want to carry over existing prompts, reports, and models from SQLite:

```python
"""
migrate.py — run once from repo root after docker-compose up -d
"""
import json, os, sqlite3, psycopg2, psycopg2.extras

PG_URL = "postgresql://stocks_ai:stocks_ai_dev@localhost:5432/stocks_ai"

sqlite_stocks = sqlite3.connect("data/stocks-ai.db")
sqlite_stocks.row_factory = sqlite3.Row
sqlite_ai = sqlite3.connect("data/ai-service.db")
sqlite_ai.row_factory = sqlite3.Row

pg = psycopg2.connect(PG_URL, cursor_factory=psycopg2.extras.RealDictCursor)

with pg.cursor() as cur:
    # Prompts
    for row in sqlite_stocks.execute("SELECT * FROM prompts"):
        cur.execute(
            "INSERT INTO prompts (id, title, text, attachments, created_at, updated_at, category)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (row["id"], row["title"], row["text"],
             json.loads(row["attachments"]),   # TEXT → Python list → JSONB
             row["created_at"], row["updated_at"], row["category"]),
        )

    # Reports
    for row in sqlite_stocks.execute("SELECT * FROM reports"):
        cur.execute(
            "INSERT INTO reports (id, title, columns, rows, source_prompt_title, created_at, model_results)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (row["id"], row["title"],
             json.loads(row["columns"]),
             json.loads(row["rows"]),
             row["source_prompt_title"], row["created_at"],
             json.loads(row["model_results"]) if row["model_results"] else None),
        )

    # Models
    for row in sqlite_ai.execute("SELECT * FROM models"):
        cur.execute(
            "INSERT INTO models (id, name, provider, base_url, api_key, is_default, created_at)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (row["id"], row["name"], row["provider"], row["base_url"],
             row["api_key"], row["is_default"], row["created_at"]),
        )

    # Reset SERIAL sequences so next auto-insert doesn't collide with migrated IDs
    cur.execute("SELECT setval('prompts_id_seq', (SELECT MAX(id) FROM prompts))")
    cur.execute("SELECT setval('reports_id_seq', (SELECT MAX(id) FROM reports))")

pg.commit()
pg.close()
print("Migration complete.")
```

Run with: `python3 migrate.py` (requires psycopg2: `pip3 install psycopg2-binary`)

---

## Startup Sequence After Implementation

```bash
# 1. Start PostgreSQL — init.sql runs automatically on first boot
docker-compose up -d

# 2. Verify PG is running and schema created
docker-compose ps
psql "postgresql://stocks_ai:stocks_ai_dev@localhost:5432/stocks_ai" -c "\dt"
# Expected: prompts, reports, models

# 3. (Optional) Migrate existing SQLite data
python3 migrate.py

# 4. Install updated Node deps
cd server && yarn add pg dotenv && yarn remove better-sqlite3

# 5. Install updated Python deps
cd ai-service && .venv/bin/pip install psycopg2-binary

# 6. Start services as usual
cd server && npm run dev
cd ai-service && .venv/bin/uvicorn src.main:app --reload --port 5007
cd client && npm start
```

---

## Verification Checklist

```bash
# Health checks
curl http://localhost:5006/api/health      # { "status": "ok" }
curl http://localhost:5007/health          # { "status": "ok" }
curl http://localhost:5007/models          # array of seeded models with ready flags
```

**UI smoke test (http://localhost:5005):**

- [ ] Prompts tab — create a prompt with an attachment, edit it, delete it
- [ ] Reports tab — save a report from a chat response, delete it
- [ ] Models page — models listed, API keys show `ready: true`
- [ ] Chat tab — send a message, get a streamed response

**Reset the database at any time:**

```bash
docker-compose down -v && docker-compose up -d
# Volume is wiped, init.sql re-runs, ai-service seeds models on next startup
```
