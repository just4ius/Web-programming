/**
 * Middleware симуляції нестабільності мережі та сервера (Fault / Chaos Injection).
 * 
 * Згідно з вимогами Практичної 5:
 * - 15% запитів отримують затримку 1200–2000 мс (для тестування таймауту клієнта AbortController > 1c).
 * - 20% запитів отримують помилки 500 (unexpected) або 503 (unavailable) для перевірки механізму ретраїв.
 * 
 * Може бути активовано глобально через змінну оточення ENABLE_CHAOS=true
 * або індивідуально для тестових запитів через заголовки:
 * - X-Simulate-Chaos: true
 * - X-Simulate-Delay: <ms> (наприклад, 1500)
 * - X-Simulate-Error: <500|503>
 */
function createFaultInjectionMiddleware({ defaultEnabled = false } = {}) {
  return async (req, res, next) => {
    const headerChaos = req.get('X-Simulate-Chaos') === 'true';
    const headerDelay = req.get('X-Simulate-Delay');
    const headerError = req.get('X-Simulate-Error');
    const envChaos = process.env.ENABLE_CHAOS === 'true';

    // 1. Примусова симуляція затримки (для тестування таймаутів клієнта)
    if (headerDelay) {
      const delayMs = parseInt(headerDelay, 10) || 1200;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // 2. Примусова симуляція помилки 5xx (для тестування exponential backoff ретраїв)
    if (headerError) {
      const statusCode = parseInt(headerError, 10) || 500;
      const errType = statusCode === 503 ? 'unavailable' : 'unexpected';
      return res.status(statusCode).json({
        error: errType,
        code: statusCode === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
        details: [{ message: `Simulated server fault: ${errType}` }],
        requestId: req.rid || req.get('X-Request-Id'),
      });
    }

    // 3. Імовірнісна симуляція (15% затримка, 20% помилки 500/503)
    const isChaosActive = defaultEnabled || envChaos || headerChaos;
    if (isChaosActive) {
      const r = Math.random();

      // 15% затримок від 1200мс до 2000мс
      if (r < 0.15) {
        const delay = 1200 + Math.random() * 800;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // 20% збоїв (r > 0.80)
      if (r > 0.80) {
        const errType = Math.random() < 0.5 ? 'unavailable' : 'unexpected';
        const code = errType === 'unavailable' ? 503 : 500;
        return res.status(code).json({
          error: errType,
          code: code === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
          details: [{ message: `Simulated transient error: ${errType}` }],
          requestId: req.rid || req.get('X-Request-Id'),
        });
      }
    }

    next();
  };
}

module.exports = createFaultInjectionMiddleware;
