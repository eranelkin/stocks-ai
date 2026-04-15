const express = require('express');
const cors = require('cors');
const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/health', healthRouter);

app.listen(PORT, () => {
  console.log(`stocks-ai-server running on http://localhost:${PORT}`);
});
