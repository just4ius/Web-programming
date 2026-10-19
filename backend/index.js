const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const requestIdMiddleware = require('./api/middleware/requestId');
const createRateLimiter = require('./api/middleware/rateLimiter');
const createFaultInjectionMiddleware = require('./api/middleware/faultInjection');
const { createPageRouter, errorHandler } = require('./api/pageRouter');

function createApp(options = {}) {
  const app = express();

  app.use(cors({ exposedHeaders: ['X-Request-Id', 'Retry-After'] }));
  app.use(express.json());

  // 1. Кореляційний заголовок X-Request-Id для кожного запиту та відповіді
  app.use(requestIdMiddleware);

  // 2. Rate limiting з заголовком Retry-After (10с вікно, 8 запитів за замовчуванням)
  const rateLimiter = options.rateLimiter || createRateLimiter(options.rateLimitOptions);
  app.use(rateLimiter);

  // 3. Симуляція затримок та збоїв 5xx (за замовчуванням вимкнено або керується хедерами / ENABLE_CHAOS)
  const faultInjection = options.faultInjection || createFaultInjectionMiddleware(options.faultOptions);
  app.use(faultInjection);

  // 4. Health check endpoint (OpenAPI & Lab 5 requirement)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // 5. RESTful CRUD API для Pages з підтримкою ідемпотентності (Практична 4 та 5)
  const pageRouter = options.pageRouter || createPageRouter(options.pageRouterOptions);
  app.use('/pages', pageRouter);

  // 6. Ендпоінт з 1-ї практичної для зворотної сумісності
  app.get('/items', async (req, res) => {
    try {
      const result = await db.query('SELECT id, name FROM items ORDER BY id ASC');
      res.status(200).json(result.rows);
    } catch (error) {
      console.error('Items query failed:', error.message);
      res.status(500).json({
        error: 'InternalServerError',
        code: 'DATABASE_ERROR',
        details: [{ message: 'Database query failed' }],
        requestId: req.rid,
      });
    }
  });

  // 7. Єдиний middleware обробки помилок за контрактом ErrorResponse ({ error, code?, details?, requestId })
  app.use(errorHandler);

  return app;
}

const app = createApp();
app.createApp = createApp;

const PORT = process.env.PORT || 8080;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
