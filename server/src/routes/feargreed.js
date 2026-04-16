const { Router } = require('express');
const https = require('https');

const router = Router();

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'stocks-ai-app/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// GET /api/feargreed
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (!cache || now - cacheTime > CACHE_TTL) {
      const data = await httpGet('https://feargreedchart.com/api/?action=all');
      cache = {
        score:      data.score.score,
        components: data.score.components,
        timestamp:  data.ts,
      };
      cacheTime = now;
    }
    res.json(cache);
  } catch (err) {
    // Return stale cache rather than an error if we have it
    if (cache) return res.json({ ...cache, stale: true });
    res.status(502).json({ error: `Failed to fetch Fear & Greed data: ${err.message}` });
  }
});

// ── History (CSV) ─────────────────────────────────────────────────────────────

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'stocks-ai-app/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function parseHistoryCSV(raw) {
  const lines = raw.trim().split('\n');
  return lines.slice(1).reduce((acc, line) => {
    const cols = line.split(',');
    if (cols.length < 3) return acc;
    const score = parseInt(cols[1], 10);
    if (isNaN(score)) return acc;
    acc.push({ date: cols[0].trim(), score, zone: cols[2].trim() });
    return acc;
  }, []);
}

let historyCache = null;
let historyCacheTime = 0;
const HISTORY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// GET /api/feargreed/history?days=14
router.get('/history', async (req, res) => {
  try {
    const now = Date.now();
    if (!historyCache || now - historyCacheTime > HISTORY_CACHE_TTL) {
      const csv = await httpGetText('https://feargreedchart.com/api/?action=history&format=csv');
      const parsed = parseHistoryCSV(csv);
      parsed.sort((a, b) => a.date.localeCompare(b.date)); // ascending by date
      historyCache = parsed;
      historyCacheTime = now;
    }
    const days = Math.min(parseInt(req.query.days, 10) || 14, 365);
    res.json(historyCache.slice(-days));
  } catch (err) {
    if (historyCache) {
      const days = Math.min(parseInt(req.query.days, 10) || 14, 365);
      return res.json(historyCache.slice(-days));
    }
    res.status(502).json({ error: `Failed to fetch Fear & Greed history: ${err.message}` });
  }
});

module.exports = router;
