const { Router } = require('express');
const db = require('../db');

const router = Router();

function parseReport(row) {
  return {
    ...row,
    columns: JSON.parse(row.columns),
    rows: JSON.parse(row.rows),
    model_results: row.model_results ? JSON.parse(row.model_results) : null,
  };
}

// GET /api/reports
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all();
  res.json(rows.map(parseReport));
});

// GET /api/reports/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Report not found' });
  res.json(parseReport(row));
});

// POST /api/reports
router.post('/', (req, res) => {
  const { title, columns, rows, source_prompt_title = null, model_results = null } = req.body;
  if (!title?.trim())              return res.status(400).json({ error: 'title is required' });
  if (!Array.isArray(columns) || columns.length === 0)
                                   return res.status(400).json({ error: 'columns must be a non-empty array' });
  if (!Array.isArray(rows))        return res.status(400).json({ error: 'rows must be an array' });

  const result = db
    .prepare('INSERT INTO reports (title, columns, rows, source_prompt_title, model_results) VALUES (?, ?, ?, ?, ?)')
    .run(
      title.trim(),
      JSON.stringify(columns),
      JSON.stringify(rows),
      source_prompt_title ?? null,
      model_results ? JSON.stringify(model_results) : null,
    );

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseReport(row));
});

// DELETE /api/reports/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Report not found' });
  res.status(204).send();
});

module.exports = router;
