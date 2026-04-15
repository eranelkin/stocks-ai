const { Router } = require('express');
const db = require('../db');

const router = Router();

function parsePrompt(row) {
  return { ...row, attachments: JSON.parse(row.attachments) };
}

// GET /api/prompts
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM prompts ORDER BY created_at DESC').all();
  res.json(rows.map(parsePrompt));
});

// GET /api/prompts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prompt not found' });
  res.json(parsePrompt(row));
});

// POST /api/prompts
router.post('/', (req, res) => {
  const { title, text, attachments = [] } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!text?.trim())  return res.status(400).json({ error: 'text is required' });

  const result = db
    .prepare('INSERT INTO prompts (title, text, attachments) VALUES (?, ?, ?)')
    .run(title.trim(), text.trim(), JSON.stringify(attachments));

  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parsePrompt(row));
});

// PUT /api/prompts/:id
router.put('/:id', (req, res) => {
  const { title, text, attachments } = req.body;
  const { id } = req.params;

  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!text?.trim())  return res.status(400).json({ error: 'text is required' });

  const existing = db.prepare('SELECT id FROM prompts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });

  db.prepare(`
    UPDATE prompts
    SET title = ?, text = ?, attachments = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title.trim(), text.trim(), JSON.stringify(attachments ?? []), id);

  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
  res.json(parsePrompt(row));
});

// DELETE /api/prompts/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Prompt not found' });
  res.status(204).send();
});

module.exports = router;
