# Database Migrations

This project uses a simple file-based migration system for both SQLite databases.
Migrations are plain `.sql` files committed to git — both machines always have the same
set, and each DB tracks which ones it has already applied.

---

## How It Works

1. Migration files live under `server/migrations/` and `ai-service/migrations/`
2. Each DB has a `schema_migrations` table that records applied filenames
3. On every startup, the runner reads all `.sql` files in sorted order, skips already-applied
   ones, and runs the new ones — each file in a transaction
4. A failed migration rolls back and stops startup with a clear error

**Data is never touched.** Migrations only add structure (tables, columns, indices).

---

## File Naming Convention

```
NNN_description_of_change.sql
```

- `NNN` — zero-padded 3-digit sequence number (001, 002, … 099, 100, …)
- Use the **next available number** in the folder — never reuse or reorder
- Use lowercase, words separated by underscores
- Keep the description short but meaningful

**Examples:**
```
004_add_prompt_tags.sql
005_add_reports_archived_flag.sql
006_create_sessions_table.sql
```

---

## Where to Put Migration Files

| Change is in…            | Migration file goes in…       |
|--------------------------|-------------------------------|
| `prompts` or `reports` table | `server/migrations/`      |
| `models` or `audit_logs` table | `ai-service/migrations/` |

---

## Writing a Migration File

Each file contains one or more SQL statements separated by semicolons.

### Adding a column
```sql
ALTER TABLE prompts ADD COLUMN tags TEXT;
```

### Adding a column with a default (required for NOT NULL)
```sql
ALTER TABLE prompts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
```

### Creating a new table
```sql
CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### Adding an index
```sql
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
```

### Multiple statements in one file (all apply atomically)
```sql
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

ALTER TABLE prompts ADD COLUMN tag_id INTEGER REFERENCES tags(id);
```

---

## Rules

1. **Never edit an existing migration file.** Once committed and applied, it is permanent.
   If you made a mistake, write a new migration that corrects it.

2. **Additive only.** Only ADD columns, tables, or indices. Never DROP or RENAME in a
   migration — that risks data loss and breaks other machines.

3. **Always use `IF NOT EXISTS`** on `CREATE TABLE` and `CREATE INDEX` statements.

4. **New `NOT NULL` columns must have a `DEFAULT`** so existing rows stay valid.

5. **One logical change per file.** Keeps history readable and rollbacks easier to reason about.

6. **Never put data changes (INSERT/UPDATE/DELETE) in a migration.** Migrations are for
   schema only. Data is machine-local and must not be touched.

---

## Step-by-Step: Adding a Schema Change

```bash
# 1. Find the next sequence number
ls server/migrations/        # e.g. 001, 002, 003 exist → next is 004

# 2. Create the file
touch server/migrations/004_add_prompt_tags.sql

# 3. Write the SQL (see examples above)

# 4. Test locally — restart the server and confirm it logs:
#    [migrate] applied 004_add_prompt_tags.sql

# 5. Commit and push
git add server/migrations/004_add_prompt_tags.sql
git commit -m "migration: add tags column to prompts"
git push
```

**On the other machine:**
```bash
git pull
# restart server or ai-service → migration applies automatically on startup
```

---

## Verifying Applied Migrations

Query the `schema_migrations` table directly:

```bash
# Server DB
sqlite3 data/stocks-ai.db "SELECT * FROM schema_migrations ORDER BY applied_at;"

# AI Service DB
sqlite3 data/ai-service.db "SELECT * FROM schema_migrations ORDER BY applied_at;"
```

---

## Current Migration History

### server/migrations/

| File | What it does |
|------|-------------|
| `001_initial_schema.sql` | Creates `prompts` and `reports` tables |
| `002_add_prompts_category.sql` | Adds `category` column to `prompts` |
| `003_add_reports_model_results.sql` | Adds `model_results` column to `reports` |

### ai-service/migrations/

| File | What it does |
|------|-------------|
| `001_initial_models.sql` | Creates `models` table |
| `002_add_web_search_columns.sql` | Adds `web_search`, `web_search_strategy`, `extra_headers`, `extra_params` to `models` |
| `003_add_is_active.sql` | Adds `is_active` column to `models` |
| `004_initial_logs.sql` | Creates `audit_logs` table and its indices |

---

## Runner Implementation

| Service | Runner file | Called from |
|---------|-------------|-------------|
| Server (Node.js) | `server/src/db/migrate.js` | `server/src/db/index.js` on startup |
| AI Service (Python) | `ai-service/src/db/migrate.py` | `models_db.init_db()` and `logs_db.init_logs_db()` on startup |

The runners handle **existing databases gracefully**: if a column already exists (e.g. on a
machine that had the column before the migration system was introduced), the `duplicate column
name` error is silently skipped and the migration is still recorded as applied.

---

## Instructions for Claude Code

> This section is for AI context. When working in this repo, follow these rules for any
> database schema change.

**NEVER** modify the inline schema code directly to add columns or tables. The old pattern
(try/catch ALTER TABLE in startup code) has been replaced.

**ALWAYS** create a new numbered `.sql` file in the correct migrations folder instead:
- Schema changes to `prompts` or `reports` → `server/migrations/NNN_description.sql`
- Schema changes to `models` or `audit_logs` → `ai-service/migrations/NNN_description.sql`

**When asked to add a column or table:**
1. Check existing files in the migrations folder to find the next sequence number
2. Create `NNN_description.sql` with the appropriate SQL
3. Do NOT touch `server/src/db/index.js`, `models_db.py`, or `logs_db.py` for schema changes —
   the runners pick up new files automatically

**When asked to rename or drop something:** warn the user that this is destructive and
propose an additive alternative (e.g. add a new column, migrate data manually, deprecate
the old one) rather than writing a DROP or RENAME migration.
