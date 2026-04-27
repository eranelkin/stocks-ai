const { Router } = require('express');
const https = require('https');
const http = require('http');

const router = Router();

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata/';
const CNN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://edition.cnn.com/markets/fear-and-greed',
  'Accept': 'application/json, */*',
};

function httpGet(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, { headers: CNN_HEADERS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects === 0) return reject(new Error('Too many redirects'));
        res.resume(); // drain response
        return resolve(httpGet(res.headers.location, redirects - 1));
      }
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

function parseHistoryCNN(data) {
  return data.fear_and_greed_historical.data
    .map((d) => ({
      date: new Date(d.x).toISOString().slice(0, 10),
      score: Math.round(d.y),
      zone: d.rating,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function ensureCache() {
  const now = Date.now();
  if (!cache || now - cacheTime > CACHE_TTL) {
    const data = await httpGet(CNN_URL);
    cache = {
      score:     Math.round(data.fear_and_greed.score),
      components: [],
      timestamp:  data.fear_and_greed.timestamp,
      history:    parseHistoryCNN(data),
    };
    cacheTime = now;
  }
}

// GET /api/feargreed
router.get('/', async (req, res) => {
  try {
    await ensureCache();
    const { score, components, timestamp } = cache;
    res.json({ score, components, timestamp });
  } catch (err) {
    if (cache) return res.json({ score: cache.score, components: cache.components, timestamp: cache.timestamp, stale: true });
    res.status(502).json({ error: `Failed to fetch Fear & Greed data: ${err.message}` });
  }
});

// GET /api/feargreed/history?days=14
router.get('/history', async (req, res) => {
  try {
    await ensureCache();
    const days = Math.min(parseInt(req.query.days, 10) || 14, 365);
    res.json(cache.history.slice(-days));
  } catch (err) {
    if (cache) {
      const days = Math.min(parseInt(req.query.days, 10) || 14, 365);
      return res.json(cache.history.slice(-days));
    }
    res.status(502).json({ error: `Failed to fetch Fear & Greed history: ${err.message}` });
  }
});

module.exports = router;
