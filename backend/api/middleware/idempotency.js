/**
 * Middleware забезпечення ідемпотентності для POST-запитів.
 * Працює на основі заголовка `Idempotency-Key`.
 * Зберігає результат першого успішного запиту та повертає його на всі наступні повтори,
 * запобігаючи повторному створенню сутності чи дублюванню побічних ефектів.
 * Також обробляє паралельні сабміти (double-click) через in-flight promise locking.
 */
function createIdempotencyMiddleware({
  store = new Map(),
  required = false,
} = {}) {
  const inFlight = new Map(); // key -> Promise<{ status, body }>

  const middleware = async (req, res, next) => {
    // Ідемпотентність застосовується для POST запитів
    if (req.method !== 'POST') {
      return next();
    }

    const key = req.get('Idempotency-Key');

    if (!key) {
      if (required) {
        return res.status(400).json({
          error: 'idempotency_key_required',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          details: [{ field: 'Idempotency-Key', message: 'Header Idempotency-Key is required' }],
          requestId: req.rid,
        });
      }
      return next();
    }

    // 1. Якщо відповідь уже закешована для даного ключа
    if (store.has(key)) {
      const cached = store.get(key);
      const responseBody = typeof cached.body === 'object' && cached.body !== null
        ? { ...cached.body, requestId: req.rid }
        : cached.body;
      return res.status(cached.status || 201).json(responseBody);
    }

    // 2. Якщо вже виконується паралельний запит із цим же ключем (конкурентний double-click)
    if (inFlight.has(key)) {
      try {
        const cached = await inFlight.get(key);
        const responseBody = typeof cached.body === 'object' && cached.body !== null
          ? { ...cached.body, requestId: req.rid }
          : cached.body;
        return res.status(cached.status || 201).json(responseBody);
      } catch (err) {
        return next(err);
      }
    }

    // 3. Перший запит із таким ключем: фіксуємо in-flight стан
    let resolveFlight;
    let rejectFlight;
    const flightPromise = new Promise((resolve, reject) => {
      resolveFlight = resolve;
      rejectFlight = reject;
    });
    inFlight.set(key, flightPromise);

    // Перехоплюємо res.json для кешування відповіді
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cachedEntry = {
          status: res.statusCode,
          body: body,
        };
        store.set(key, cachedEntry);
        resolveFlight(cachedEntry);
      } else {
        rejectFlight(new Error(`Operation finished with error status ${res.statusCode}`));
      }
      inFlight.delete(key);
      return originalJson(body);
    };

    // Перехоплюємо помилки Express-пайплайну
    const originalNext = next;
    next = (err) => {
      if (err) {
        rejectFlight(err);
        inFlight.delete(key);
      }
      originalNext(err);
    };

    next();
  };

  middleware.reset = () => {
    store.clear();
    inFlight.clear();
  };

  middleware.store = store;

  return middleware;
}

module.exports = createIdempotencyMiddleware;
