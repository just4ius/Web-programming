const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { createPageRouter, errorHandler } = require('../api/pageRouter');
const PageService = require('../service/PageService');
const PageRepository = require('../repository/PageRepository');

describe('API Endpoints Integration Tests (OpenAPI compliance)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const testApp = express();
    testApp.use(cors());
    testApp.use(express.json());

    const requestIdMiddleware = require('../api/middleware/requestId');
    testApp.use(requestIdMiddleware);

    testApp.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    const memoryRepo = new PageRepository({ useMemory: true });
    const pageService = new PageService(memoryRepo);
    testApp.use('/pages', createPageRouter(pageService));
    testApp.use(errorHandler);

    await new Promise((resolve) => {
      server = testApp.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /health повертає 200 та { status: "ok" }', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { status: 'ok' });
  });

  it('POST /pages повертає 201 Created та створений об’єкт за схемою PageResponse', async () => {
    const payload = {
      title: 'Головна база знань',
      icon: '🧠',
    };
    const res = await fetch(`${baseUrl}/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.id, 1);
    assert.equal(data.title, 'Головна база знань');
    assert.equal(data.icon, '🧠');
    assert.equal(data.isArchived, false);
    assert.ok(data.createdAt);
  });

  it('POST /pages з некоректними даними повертає 400 Bad Request та ErrorResponse', async () => {
    const res = await fetch(`${baseUrl}/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'ValidationError');
    assert.equal(data.code, 'TITLE_REQUIRED');
    assert.ok(Array.isArray(data.details));
  });

  it('GET /pages повертає 200 OK та масив сторінок', async () => {
    const res = await fetch(`${baseUrl}/pages`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 1);
  });

  it('GET /pages/:id повертає 200 OK для існуючої сторінки', async () => {
    const res = await fetch(`${baseUrl}/pages/1`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, 1);
    assert.equal(data.title, 'Головна база знань');
  });

  it('GET /pages/:id повертає 404 Not Found та ErrorResponse для неіснуючої сторінки', async () => {
    const res = await fetch(`${baseUrl}/pages/9999`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.error, 'NotFoundError');
    assert.equal(data.code, 'PAGE_NOT_FOUND');
  });

  it('PUT /pages/:id повертає 200 OK та оновлену сторінку', async () => {
    const payload = {
      title: 'Оновлена назва бази знань',
      icon: '📚',
      isArchived: true,
    };
    const res = await fetch(`${baseUrl}/pages/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, 1);
    assert.equal(data.title, 'Оновлена назва бази знань');
    assert.equal(data.icon, '📚');
    assert.equal(data.isArchived, true);
  });

  it('DELETE /pages/:id повертає 204 No Content', async () => {
    const res = await fetch(`${baseUrl}/pages/1`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 204);

    // Перевірка, що сторінку видалено
    const checkRes = await fetch(`${baseUrl}/pages/1`);
    assert.equal(checkRes.status, 404);
  });
});
