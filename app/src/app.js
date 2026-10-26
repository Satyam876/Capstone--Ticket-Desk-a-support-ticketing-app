const express = require('express');
const { init } = require('./db');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Test hook: wipe DB back to seeded state. Never enabled in production.
if (process.env.NODE_ENV !== 'production') {
  app.post('/test/reset', (_req, res) => { init(); res.status(204).end(); });
}

app.use('/auth', require('./routes/auth'));
app.use('/tickets', require('./routes/tickets'));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
