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

module.exports = router;
