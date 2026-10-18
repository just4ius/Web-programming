/**
 * Middleware для обмеження частоти запитів (Rate Limiting) з підтримкою заголовка Retry-After.
 * За замовчуванням: вікно 10 000 мс (10 с), максимум 8 запитів.
 * При перевищенні повертає статус 429 з заголовком Retry-After та уніфікованою помилкою.
 */
function createRateLimiter({
  windowMs = 10_000,
  maxRequests = 8,
  retryAfterSeconds = 2,
  skip = () => false,
} = {}) {
  const rateStore = new Map(); // ip -> { count, ts }
  const now = () => Date.now();

  const limiter = (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local';
    const b = rateStore.get(ip) ?? { count: 0, ts: now() };
    const within = now() - b.ts < windowMs;
    const state = within ? { count: b.count + 1, ts: b.ts } : { count: 1, ts: now() };
    rateStore.set(ip, state);

    if (state.count > maxRequests) {
      const retryAfter = typeof retryAfterSeconds === 'function'
        ? retryAfterSeconds(state, b, windowMs)
        : String(retryAfterSeconds);

      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'too_many_requests',
        code: 'TOO_MANY_REQUESTS',
        details: [
          { message: `Rate limit of ${maxRequests} requests per ${windowMs / 1000}s exceeded. Please retry after ${retryAfter}s.` },
        ],
        requestId: req.rid || req.get('X-Request-Id'),
      });
    }

    next();
  };

  limiter.reset = () => {
    rateStore.clear();
  };

  return limiter;
}

module.exports = createRateLimiter;
