const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');

const requestIdMiddleware = require('../api/middleware/requestId');
const createRateLimiter = require('../api/middleware/rateLimiter');
const createFaultInjectionMiddleware = require('../api/middleware/faultInjection');
const createIdempotencyMiddleware = require('../api/middleware/idempotency');
const { createPageRouter, errorHandler } = require('../api/pageRouter');
const PageService = require('../service/PageService');
const PageRepository = require('../repository/PageRepository');

describe('Практична 5: Error-handling & Resilience Tests', () => {
  let server;
  let baseUrl;
  let memoryRepo;
  let pageService;
  let rateLimiter;
  let idempotencyMiddleware;

  before(async () => {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // 1. Кореляційний X-Request-Id middleware
    app.use(requestIdMiddleware);

    // 2. Rate limiter: для тестів налаштовуємо ліміт 5 запитів у вікні 5 секунд
    rateLimiter = createRateLimiter({
      windowMs: 5000,
      maxRequests: 5,
      retryAfterSeconds: 2,
    });
    app.use(rateLimiter);

    // 3. Fault injection middleware
    app.use(createFaultInjectionMiddleware());

    // 4. GET /health
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    // 5. Pages router з окремим сховищем у пам'яті
    memoryRepo = new PageRepository({ useMemory: true });
    pageService = new PageService(memoryRepo);
    idempotencyMiddleware = createIdempotencyMiddleware();

    app.use('/pages', createPageRouter({
      pageService,
      idempotencyMiddleware,
    }));

    // 6. Обробка помилок
    app.use(errorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    rateLimiter.reset();
    idempotencyMiddleware.reset();
  });

  describe('1. Кореляція запитів (X-Request-Id)', () => {
    it('Кожна відповідь містить заголовок X-Request-Id (згенерований автоматично)', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const rid = res.headers.get('x-request-id');
      assert.ok(rid, 'Заголовок X-Request-Id повинен бути присутній у відповіді');
      assert.match(rid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('Якщо клієнт надсилає власний X-Request-Id, сервер використовує його', async () => {
      const customRid = 'client-custom-req-777';
      const res = await fetch(`${baseUrl}/health`, {
        headers: { 'X-Request-Id': customRid },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-request-id'), customRid);
    });

    it('При помилці валідації requestId продубльовано у тілі JSON-відповіді', async () => {
      const customRid = 'client-err-req-888';
      const res = await fetch(`${baseUrl}/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': customRid,
        },
        body: JSON.stringify({ title: '' }),
      });

      assert.equal(res.status, 400);
      assert.equal(res.headers.get('x-request-id'), customRid);

      const body = await res.json();
      assert.equal(body.error, 'ValidationError');
      assert.equal(body.code, 'TITLE_REQUIRED');
      assert.equal(body.requestId, customRid, 'requestId у тілі має відповідати X-Request-Id');
    });
  });

  describe('2. Ідемпотентність (Idempotency-Key)', () => {
    it('Повторний POST із тим самим Idempotency-Key повертає ідентичний результат без створення дубля', async () => {
      const idemKey = 'idem-unique-key-101';
      const payload = { title: 'Ідемпотентний документ Notion', icon: '⚡' };

      // Перший запит - створює сторінку
      const res1 = await fetch(`${baseUrl}/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Request-Id': 'req-first-call',
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res1.status, 201);
      const data1 = await res1.json();
      assert.ok(data1.id);
      assert.equal(data1.title, payload.title);
      assert.equal(data1.icon, payload.icon);

      // Рахуємо сторінки у репозиторії
      const initialPages = await memoryRepo.getAll();
      const countAfterFirst = initialPages.length;

      // Повторний запит із тим самим Idempotency-Key
      const res2 = await fetch(`${baseUrl}/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Request-Id': 'req-second-call',
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res2.status, 201);
      const data2 = await res2.json();

      // Має повертати абсолютно ідентичний id та атрибути
      assert.equal(data2.id, data1.id);
      assert.equal(data2.title, data1.title);
      assert.equal(data2.icon, data1.icon);
      assert.equal(data2.createdAt, data1.createdAt);

      // Перевіряємо, що в БД/репозиторії НЕ з’явився дубль
      const pagesAfterSecond = await memoryRepo.getAll();
      assert.equal(pagesAfterSecond.length, countAfterFirst, 'Кількість записів не повинна збільшитись');
    });

    it('Паралельні сабміти (double-click) з однаковим Idempotency-Key створюють лише 1 ресурс', async () => {
      const idemKey = 'parallel-click-key-202';
      const payload = { title: 'Double Click Prevention Doc', icon: '🛡️' };

      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/pages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idemKey,
            'X-Request-Id': 'click-1',
          },
          body: JSON.stringify(payload),
        }),
        fetch(`${baseUrl}/pages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idemKey,
            'X-Request-Id': 'click-2',
          },
          body: JSON.stringify(payload),
        }),
      ]);

      assert.equal(resA.status, 201);
      assert.equal(resB.status, 201);

      const dataA = await resA.json();
      const dataB = await resB.json();

      assert.equal(dataA.id, dataB.id, 'Обидва паралельні запити мають повернути однаковий id');
      assert.equal(dataA.title, payload.title);
      assert.equal(dataB.title, payload.title);
    });

    it('Різні Idempotency-Key створюють окремі нові ресурси', async () => {
      const payload1 = { title: 'Doc A', icon: '🅰️' };
      const payload2 = { title: 'Doc B', icon: '🅱️' };

      const res1 = await fetch(`${baseUrl}/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'key-doc-a',
        },
        body: JSON.stringify(payload1),
      });

      const res2 = await fetch(`${baseUrl}/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'key-doc-b',
        },
        body: JSON.stringify(payload2),
      });

      const data1 = await res1.json();
      const data2 = await res2.json();

      assert.notEqual(data1.id, data2.id, 'Різні ключі мають створювати різні сутності');
    });
  });

  describe('3. Обмеження швидкості запитів (Rate Limiting) та Retry-After', () => {
    it('Повертає 429 Too Many Requests та заголовок Retry-After при перевищенні ліміту', async () => {
      // Виконуємо 5 допустимих запитів
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${baseUrl}/health`);
        assert.equal(res.status, 200);
      }

      // 6-й запит має бути заблокований лімітером
      const blockedRes = await fetch(`${baseUrl}/health`);
      assert.equal(blockedRes.status, 429);

      // Перевіряємо заголовок Retry-After
      const retryAfter = blockedRes.headers.get('retry-after');
      assert.ok(retryAfter, 'Заголовок Retry-After має бути присутній');
      assert.equal(retryAfter, '2');

      // Перевіряємо єдиний формат помилки та requestId
      const errorData = await blockedRes.json();
      assert.equal(errorData.error, 'too_many_requests');
      assert.equal(errorData.code, 'TOO_MANY_REQUESTS');
      assert.ok(errorData.requestId);
      assert.ok(Array.isArray(errorData.details));
    });
  });

  describe('4. Fault Injection & Client Timeout (AbortController)', () => {
    it('GET /health повертає { status: "ok" } за нормальних умов', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data, { status: 'ok' });
    });

    it('Симуляція помилки 503 Service Unavailable через X-Simulate-Error', async () => {
      const res = await fetch(`${baseUrl}/pages`, {
        headers: { 'X-Simulate-Error': '503' },
      });
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.error, 'unavailable');
      assert.equal(data.code, 'SERVICE_UNAVAILABLE');
      assert.ok(data.requestId);
    });

    it('Симуляція помилки 500 Internal Server Error через X-Simulate-Error', async () => {
      const res = await fetch(`${baseUrl}/pages`, {
        headers: { 'X-Simulate-Error': '500' },
      });
      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.error, 'unexpected');
      assert.equal(data.code, 'INTERNAL_SERVER_ERROR');
      assert.ok(data.requestId);
    });

    it('Клієнтський AbortController відміняє запит до /health, якщо затримка сервера > 1000мс', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1с таймаут

      let aborted = false;
      try {
        // Симулюємо серверну затримку 1400 мс (більше 1с)
        await fetch(`${baseUrl}/health`, {
          signal: controller.signal,
          headers: { 'X-Simulate-Delay': '1400' },
        });
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          aborted = true;
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timeoutId);
      }

      assert.equal(aborted, true, 'Запит мав бути успішно перерваний через AbortController при затримці > 1с');
    });
  });
});
