const { Router } = require('express');

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'stocks-ai-server',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

module.exports = router;
