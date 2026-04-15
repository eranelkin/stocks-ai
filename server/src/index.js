const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const healthRouter = require('./routes/health');
const promptsRouter = require('./routes/prompts');
const reportsRouter = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3001;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5005';

app.use(cors({ origin: 'http://localhost:3000' }));

// Must be registered BEFORE express.json() — the proxy needs the raw request body
// stream intact. express.json() consumes the stream and the ai-service would receive
// an empty body.
app.use(
  '/api/ai',
  createProxyMiddleware({
    target: AI_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/ai': '' },
  }),
);

app.use(express.json());
app.use('/api/health', healthRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/reports', reportsRouter);

app.listen(PORT, () => {
  console.log(`stocks-ai-server running on http://localhost:${PORT}`);
});
