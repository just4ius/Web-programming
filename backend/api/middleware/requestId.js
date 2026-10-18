const { randomUUID } = require('crypto');

/**
 * Middleware для кореляції запитів (X-Request-Id).
 * Якщо клієнт передав X-Request-Id, використовуємо його, інакше генеруємо новий UUID.
 * Встановлює X-Request-Id у заголовок відповіді та зберігає req.rid.
 */
function requestIdMiddleware(req, res, next) {
  const rid = req.get('X-Request-Id') || randomUUID();
  req.rid = rid;
  res.setHeader('X-Request-Id', rid);
  next();
}

module.exports = requestIdMiddleware;
