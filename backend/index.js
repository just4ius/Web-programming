const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const { createPageRouter, errorHandler } = require('./api/pageRouter');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Health check endpoint (OpenAPI requirement)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// RESTful CRUD API for Pages (Практична 4: Context Document & Page Management)
app.use('/pages', createPageRouter());

// Ендпоінт з 1-ї практичної для зворотної сумісності
app.get('/items', async (req, res) => {
  try {
    const result = await db.query('SELECT id, name FROM items ORDER BY id ASC');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Items query failed:', error.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Єдиний middleware обробки помилок за контрактом ErrorResponse
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;