const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations').all().map((r) => r.filename)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    if (applied.has(filename)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);

    db.transaction(() => {
      for (const stmt of statements) {
        try {
          db.exec(stmt);
        } catch (e) {
          // Column already exists on a DB that predates the migration system — skip
          if (e.message && e.message.includes('duplicate column name')) continue;
          throw e;
        }
      }
      db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(filename);
    })();

    console.log(`[migrate] applied ${filename}`);
  }
}

module.exports = { runMigrations };
