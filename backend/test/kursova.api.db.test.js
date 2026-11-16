// Інтеграційний тест API зі справжньою PostgreSQL.
// Запускається лише якщо RUN_DB_TESTS=1 (у CI — завжди, з Postgres-сервісом).
// Перед запуском потрібні міграції: npm run migrate
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const enabled = process.env.RUN_DB_TESTS === '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'test'; // без логів запитів у виводі тестів

describe('API курсового проєкту з PostgreSQL', { skip: !enabled && 'встановіть RUN_DB_TESTS=1' }, () => {
  let server;
  let base;
  let ownerToken;
  const unique = Date.now();

  async function call(method, path, { token, body, raw } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: raw || (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
  }

  before(async () => {
    const app = require('../index').createApp({ apiRouterOptions: { loginLimit: 1000 } });
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
    const reg = await call('POST', '/api/auth/register', {
      body: { companyName: `Тест ${unique}`, name: 'Власник Тест', email: `owner${unique}@test.local`, password: 'secret123' },
    });
    assert.equal(reg.status, 201);
    ownerToken = reg.data.token;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await require('../db').end();
  });

  it('/ready перевіряє з\'єднання з БД', async () => {
    const res = await call('GET', '/ready');
    assert.equal(res.status, 200);
  });

  it('Без токена — 401, з токеном — профіль власника', async () => {
    assert.equal((await call('GET', '/api/pages')).status, 401);
    const me = await call('GET', '/api/auth/me', { token: ownerToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.role, 'owner');
  });

  it('Повний цикл сторінки: створення → блоки → пошук → кошик → відновлення', async () => {
    const section = await call('POST', '/api/pages', { token: ownerToken, body: { title: 'Регламенти', icon: '📘' } });
    assert.equal(section.status, 201);
    const page = await call('POST', '/api/pages', { token: ownerToken, body: { title: 'Відпустки', parentId: section.data.id } });
    assert.equal(page.status, 201);

    const blocks = await call('PUT', `/api/pages/${page.data.id}/blocks`, {
      token: ownerToken,
      body: { blocks: [
        { type: 'h2', content: 'Порядок' },
        { type: 'paragraph', content: `Унікальне слово зебра${unique}` },
        { type: 'table', data: { rows: [['Тип', 'Днів'], ['Основна', '24']] } },
      ] },
    });
    assert.equal(blocks.status, 200);
    assert.equal(blocks.data.length, 3);

    const full = await call('GET', `/api/pages/${page.data.id}`, { token: ownerToken });
    assert.deepEqual(full.data.breadcrumbs.map((b) => b.title), ['Регламенти', 'Відпустки']);

    const found = await call('GET', `/api/search?q=${encodeURIComponent(`зебра${unique}`)}`, { token: ownerToken });
    assert.equal(found.data[0].id, page.data.id);

    // Переміщення розділу у власну підсторінку заборонено
    const cycle = await call('PATCH', `/api/pages/${section.data.id}`, { token: ownerToken, body: { parentId: page.data.id } });
    assert.equal(cycle.status, 400);
    assert.equal(cycle.data.code, 'PAGE_CYCLE');

    const archived = await call('DELETE', `/api/pages/${section.data.id}`, { token: ownerToken });
    assert.equal(archived.data.archived, 2); // розділ + підсторінка
    assert.equal((await call('GET', `/api/pages/${page.data.id}`, { token: ownerToken })).status, 404);

    const trash = await call('GET', '/api/trash', { token: ownerToken });
    assert.ok(trash.data.some((p) => p.id === section.data.id));

    const restored = await call('POST', `/api/trash/${section.data.id}/restore`, { token: ownerToken });
    assert.equal(restored.data.restored, 2);
  });

  it('Файл: завантаження з кириличною назвою, скачування, видалення', async () => {
    const page = await call('POST', '/api/pages', { token: ownerToken, body: { title: 'Статут' } });
    const form = new FormData();
    form.append('file', new Blob(['Текст статуту'], { type: 'text/plain' }), 'Статут.txt');
    const res = await fetch(`${base}/api/pages/${page.data.id}/attachments`, {
      method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` }, body: form,
    });
    assert.equal(res.status, 201);
    const meta = await res.json();
    assert.equal(meta.fileName, 'Статут.txt');

    const download = await fetch(`${base}/api/attachments/${meta.id}/download`, { headers: { Authorization: `Bearer ${ownerToken}` } });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'Текст статуту');
    assert.match(download.headers.get('content-disposition'), /UTF-8''/);

    assert.equal((await call('DELETE', `/api/attachments/${meta.id}`, { token: ownerToken })).status, 204);
  });

  it('Оргструктура і ролі: глядач бачить, але не змінює', async () => {
    const dept = await call('POST', '/api/departments', { token: ownerToken, body: { name: 'Бухгалтерія' } });
    assert.equal(dept.status, 201);
    const pos = await call('POST', '/api/positions', {
      token: ownerToken, body: { departmentId: dept.data.id, title: 'Бухгалтер', headcount: 2 },
    });
    assert.equal(pos.status, 201);

    const member = await call('POST', '/api/members', {
      token: ownerToken,
      body: { name: 'Глядач Тест', email: `viewer${unique}@test.local`, password: 'temp12345', role: 'viewer', positionId: pos.data.id },
    });
    assert.equal(member.status, 201);

    const login = await call('POST', '/api/auth/login', { body: { email: `viewer${unique}@test.local`, password: 'temp12345' } });
    assert.equal(login.data.role, 'viewer');

    const org = await call('GET', '/api/org', { token: login.data.token });
    assert.equal(org.status, 200);
    assert.ok(org.data.members.some((m) => m.positionId === pos.data.id));

    const forbidden = await call('POST', '/api/departments', { token: login.data.token, body: { name: 'Хакери' } });
    assert.equal(forbidden.status, 403);
  });

  it('Компанії ізольовані: чужа сторінка — 404', async () => {
    const page = await call('POST', '/api/pages', { token: ownerToken, body: { title: 'Секрет' } });
    const other = await call('POST', '/api/auth/register', {
      body: { companyName: `Інша ${unique}`, name: 'Інший Власник', email: `other${unique}@test.local`, password: 'secret123' },
    });
    const res = await call('GET', `/api/pages/${page.data.id}`, { token: other.data.token });
    assert.equal(res.status, 404);
  });
});
