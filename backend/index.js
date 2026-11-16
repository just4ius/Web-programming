const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const requestIdMiddleware = require('./api/middleware/requestId');
const createRequestLogger = require('./api/middleware/requestLogger');
const createRateLimiter = require('./api/middleware/rateLimiter');
const createFaultInjectionMiddleware = require('./api/middleware/faultInjection');
const { createPageRouter, errorHandler } = require('./api/pageRouter');
const { createApiRouter } = require('./api/apiRouter');

function createApp(options = {}) {
  const app = express();

  app.use(cors({ exposedHeaders: ['X-Request-Id', 'Retry-After', 'Content-Disposition'] }));
  app.use(express.json({ limit: '1mb' }));

  // 1. Кореляційний заголовок X-Request-Id для кожного запиту та відповіді
  app.use(requestIdMiddleware);

  // 2. Структуровані JSON-логи кожного запиту (практична 8)
  app.use(options.requestLogger || createRequestLogger());

  // 3. Rate limiting з заголовком Retry-After.
  //    Жорсткий ліміт лаби 5 (8 запитів / 10 с) — лише для демо-ендпоінтів лаб 1–5,
  //    для API курсового проєкту — 300 запитів за хвилину з однієї IP.
  const labLimiter = options.rateLimiter || createRateLimiter(options.rateLimitOptions);
  const apiLimiter = options.apiRateLimiter || createRateLimiter({ windowMs: 60_000, maxRequests: 300, retryAfterSeconds: 5 });
  app.use(['/pages', '/items', '/health'], labLimiter);
  app.use('/api', apiLimiter);

  // 4. Симуляція затримок та збоїв 5xx (вмикається хедерами або ENABLE_CHAOS)
  const faultInjection = options.faultInjection || createFaultInjectionMiddleware(options.faultOptions);
  app.use(faultInjection);

  // 5. Health checks: /health — «процес живий» (liveness), /ready — «готовий працювати з БД» (readiness)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/ready', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.status(200).json({ status: 'ready' });
    } catch (error) {
      res.status(503).json({
        error: 'ServiceUnavailable',
        code: 'DATABASE_UNAVAILABLE',
        details: [{ message: 'Database is not reachable' }],
        requestId: req.rid,
      });
    }
  });

  // 6. API курсового проєкту: компанії, сторінки, файли, оргструктура (потребує входу)
  app.use('/api', options.apiRouter || createApiRouter(options.apiRouterOptions));

  // 7. RESTful CRUD API для Pages з підтримкою ідемпотентності (Практична 4 та 5)
  const pageRouter = options.pageRouter || createPageRouter(options.pageRouterOptions);
  app.use('/pages', pageRouter);

  // 8. Ендпоінт з 1-ї практичної для зворотної сумісності
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

  // 9. Невідомий маршрут — 404 у єдиному форматі помилки
  app.use((req, res) => {
    res.status(404).json({
      error: 'NotFoundError',
      code: 'ROUTE_NOT_FOUND',
      details: [{ message: `Route ${req.method} ${req.path} not found` }],
      requestId: req.rid,
    });
  });

  // 10. Єдиний middleware обробки помилок за контрактом ErrorResponse ({ error, code?, details?, requestId })
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
