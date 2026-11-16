// Юніт-тести сервісів курсового проєкту. Репозиторії замінені простими «фейками» в пам'яті,
// тому тести не потребують PostgreSQL.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const AuthService = require('../service/AuthService');
const MemberService = require('../service/MemberService');
const KnowledgeService = require('../service/KnowledgeService');
const AttachmentService = require('../service/AttachmentService');

const owner = { id: 1, workspaceId: 10, role: 'owner', name: 'Олена' };
const admin = { id: 2, workspaceId: 10, role: 'admin', name: 'Адмін' };
const editor = { id: 3, workspaceId: 10, role: 'editor', name: 'Ірина' };
const viewer = { id: 4, workspaceId: 10, role: 'viewer', name: 'Андрій' };

function fakeAuthRepos() {
  const users = new Map();
  const members = [];
  let nextId = 1;
  return {
    users,
    members,
    userRepository: {
      findByEmail: async (email) => [...users.values()].find((u) => u.email === email.toLowerCase()) || null,
    },
    workspaceRepository: {
      slugExists: async (slug) => slug === 'kolosok',
      findById: async (id) => ({ id, name: 'Колосок', slug: 'kolosok' }),
      createWithOwner: async ({ name, slug, owner: o }) => {
        const user = { id: nextId++, name: o.name, email: o.email, passwordHash: o.passwordHash };
        users.set(user.id, user);
        members.push({ userId: user.id, workspaceId: 99, role: 'owner', name: o.name, email: o.email });
        return { workspace: { id: 99, name, slug }, user };
      },
    },
    memberRepository: {
      findFirstForUser: async (userId) => members.find((m) => m.userId === userId) || null,
      find: async (ws, userId) => members.find((m) => m.workspaceId === ws && m.userId === userId) || null,
    },
  };
}

describe('AuthService', () => {
  let repos;
  let auth;

  beforeEach(() => {
    repos = fakeAuthRepos();
    auth = new AuthService({ ...repos, jwtSecret: 'test-secret' });
  });

  it('Реєстрація створює компанію з унікальним slug і повертає токен', async () => {
    const result = await auth.register({
      companyName: 'Колосок', name: 'Олена Коваль', email: 'Owner@Mail.com', password: 'secret123',
    });
    assert.equal(result.workspace.slug, 'kolosok-2'); // 'kolosok' уже зайнятий
    assert.equal(result.role, 'owner');
    assert.ok(result.token);
    // Пароль збережено лише як bcrypt-хеш
    const stored = [...repos.users.values()][0];
    assert.notEqual(stored.passwordHash, 'secret123');
    assert.ok(await bcrypt.compare('secret123', stored.passwordHash));
  });

  it('Слабкий пароль відхиляється з кодом WEAK_PASSWORD', async () => {
    await assert.rejects(
      auth.register({ companyName: 'Колосок', name: 'Олена', email: 'a@b.com', password: '123' }),
      { statusCode: 400, code: 'WEAK_PASSWORD' },
    );
  });

  it('Повторна реєстрація з тим самим email — 409 EMAIL_TAKEN', async () => {
    await auth.register({ companyName: 'Колосок', name: 'Олена', email: 'a@b.com', password: 'secret123' });
    await assert.rejects(
      auth.register({ companyName: 'Інша', name: 'Олена', email: 'A@B.com', password: 'secret123' }),
      { statusCode: 409, code: 'EMAIL_TAKEN' },
    );
  });

  it('Вхід з правильним паролем повертає токен, який потім проходить authenticate()', async () => {
    await auth.register({ companyName: 'Колосок', name: 'Олена', email: 'a@b.com', password: 'secret123' });
    const { token, role } = await auth.login({ email: 'a@b.com', password: 'secret123' });
    assert.equal(role, 'owner');
    const actor = await auth.authenticate(token);
    assert.equal(actor.workspaceId, 99);
    assert.equal(actor.role, 'owner');
  });

  it('Неправильний пароль і неіснуючий email дають однакову помилку 401', async () => {
    await auth.register({ companyName: 'Колосок', name: 'Олена', email: 'a@b.com', password: 'secret123' });
    await assert.rejects(auth.login({ email: 'a@b.com', password: 'wrong-pass' }), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    await assert.rejects(auth.login({ email: 'nobody@b.com', password: 'secret123' }), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('Підроблений токен — 401 INVALID_TOKEN', async () => {
    await assert.rejects(auth.authenticate('not-a-jwt'), { statusCode: 401, code: 'INVALID_TOKEN' });
  });
});

describe('MemberService', () => {
  let members;
  let service;

  beforeEach(() => {
    members = [
      { userId: 1, workspaceId: 10, role: 'owner', name: 'Олена', email: 'o@k.ua' },
      { userId: 3, workspaceId: 10, role: 'editor', name: 'Ірина', email: 'hr@k.ua' },
    ];
    service = new MemberService({
      memberRepository: {
        list: async () => members,
        find: async (ws, id) => members.find((m) => m.userId === id) || null,
        add: async (ws, userId, role, positionId) => {
          const m = { userId, workspaceId: ws, role, positionId, name: 'Новий', email: 'new@k.ua' };
          members.push(m);
          return m;
        },
        update: async (ws, id, { role }) => Object.assign(members.find((m) => m.userId === id), role ? { role } : {}),
        remove: async () => true,
        countOwners: async () => members.filter((m) => m.role === 'owner').length,
      },
      userRepository: {
        findByEmail: async () => null,
        create: async ({ name, email }) => ({ id: 50, name, email }),
      },
      orgRepository: { getPosition: async (ws, id) => (id === 7 ? { id: 7 } : null) },
    });
  });

  it('Адмін додає працівника з посадою', async () => {
    const m = await service.add(admin, {
      name: 'Андрій', email: 'staff@k.ua', password: 'temp12345', role: 'viewer', positionId: 7,
    });
    assert.equal(m.role, 'viewer');
    assert.equal(m.positionId, 7);
  });

  it('Редактор не може керувати працівниками — 403', async () => {
    await assert.rejects(service.add(editor, { email: 'x@k.ua', name: 'X', password: 'temp12345' }), { statusCode: 403 });
  });

  it('Адмін не може призначити роль власника', async () => {
    await assert.rejects(
      service.add(admin, { email: 'x@k.ua', name: 'X', password: 'temp12345', role: 'owner' }),
      { statusCode: 403, code: 'OWNER_ONLY' },
    );
  });

  it('Не можна видалити останнього власника — 409 LAST_OWNER', async () => {
    await assert.rejects(service.remove(owner, 1), { statusCode: 409, code: 'LAST_OWNER' });
  });

  it('Неіснуюча посада — 404', async () => {
    await assert.rejects(service.update(owner, 3, { positionId: 999 }), { statusCode: 404, code: 'POSITION_NOT_FOUND' });
  });
});

describe('KnowledgeService', () => {
  let pages;
  let saved;
  let service;

  beforeEach(() => {
    // 1 «Регламенти» → 2 «Відпустки» → 3 «Лікарняні»
    pages = new Map([
      [1, { id: 1, workspaceId: 10, parentId: null, title: 'Регламенти', isArchived: false }],
      [2, { id: 2, workspaceId: 10, parentId: 1, title: 'Відпустки', isArchived: false }],
      [3, { id: 3, workspaceId: 10, parentId: 2, title: 'Лікарняні', isArchived: false }],
      [4, { id: 4, workspaceId: 10, parentId: null, title: 'Старе', isArchived: true }],
    ]);
    saved = null;
    service = new KnowledgeService({
      knowledgeRepository: {
        getPage: async (ws, id) => pages.get(id) || null,
        nextPosition: async () => 0,
        createPage: async (data) => ({ id: 100, ...data }),
        getParentMap: async () => new Map([...pages.values()].map((p) => [p.id, p.parentId])),
        updatePage: async (ws, id, fields) => ({ ...pages.get(id), ...fields }),
        replaceBlocks: async (ws, id, blocks) => { saved = blocks; return blocks; },
        search: async () => [{ id: 2, title: 'Відпустки', matchedText: 'Щорічна відпустка 24 дні', titleMatch: false }],
      },
      attachmentRepository: {},
    });
  });

  it('Створення сторінки в розділі', async () => {
    const page = await service.createPage(editor, { title: '  Новий регламент ', parentId: 1 });
    assert.equal(page.title, 'Новий регламент');
    assert.equal(page.parentId, 1);
  });

  it('Порожня назва — 400 TITLE_REQUIRED', async () => {
    await assert.rejects(service.createPage(editor, { title: '   ' }), { statusCode: 400, code: 'TITLE_REQUIRED' });
  });

  it('Не можна створити підсторінку у сторінці з кошика', async () => {
    await assert.rejects(service.createPage(editor, { title: 'X', parentId: 4 }), { statusCode: 404 });
  });

  it('Глядач не може створювати сторінки — 403', async () => {
    await assert.rejects(service.createPage(viewer, { title: 'X' }), { statusCode: 403 });
  });

  it('Переміщення розділу всередину власної підсторінки — 400 PAGE_CYCLE', async () => {
    await assert.rejects(service.updatePage(editor, 1, { parentId: 3 }), { statusCode: 400, code: 'PAGE_CYCLE' });
  });

  it('Збереження блоків очищає зайві властивості', async () => {
    await service.saveBlocks(editor, 2, [
      { type: 'h2', content: 'Порядок', data: { hacked: true } },
      { type: 'todo', content: 'Подати заяву', data: { checked: true } },
      { type: 'divider', content: 'ігнорується' },
    ]);
    assert.deepEqual(saved, [
      { type: 'h2', content: 'Порядок', data: {} },
      { type: 'todo', content: 'Подати заяву', data: { checked: true } },
      { type: 'divider', content: '', data: {} },
    ]);
  });

  it('Некоректний блок — 400 з номером блоку', async () => {
    await assert.rejects(
      service.saveBlocks(editor, 2, [{ type: 'paragraph', content: 'ok' }, { type: 'video' }]),
      { statusCode: 400, code: 'INVALID_BLOCK', message: /Block #2/ },
    );
  });

  it('Пошук повертає фрагмент тексту навколо збігу', async () => {
    const [hit] = await service.search(viewer, 'відпустка');
    assert.equal(hit.id, 2);
    assert.match(hit.snippet, /відпустка/);
  });

  it('Занадто короткий пошуковий запит — 400', async () => {
    await assert.rejects(service.search(viewer, 'a'), { statusCode: 400, code: 'INVALID_QUERY' });
  });
});

describe('AttachmentService', () => {
  const service = new AttachmentService({
    attachmentRepository: { create: async (data) => ({ id: 1, ...data }) },
    knowledgeRepository: { getPage: async (ws, id) => (id === 2 ? { id: 2, isArchived: false } : null) },
  });

  it('Кирилична назва файлу декодується з latin1 у UTF-8', () => {
    const latin1 = Buffer.from('Статут.pdf', 'utf8').toString('latin1');
    assert.equal(AttachmentService.decodeFileName(latin1), 'Статут.pdf');
  });

  it('Дозволений PDF зберігається', async () => {
    const file = { originalname: 'statut.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') };
    const saved = await service.upload(editor, 2, file);
    assert.equal(saved.fileName, 'statut.pdf');
    assert.equal(saved.pageId, 2);
  });

  it('Виконуваний файл відхиляється — FILE_TYPE_NOT_ALLOWED', async () => {
    const file = { originalname: 'virus.exe', mimetype: 'application/x-msdownload', size: 4, buffer: Buffer.from('MZ') };
    await assert.rejects(service.upload(editor, 2, file), { statusCode: 400, code: 'FILE_TYPE_NOT_ALLOWED' });
  });

  it('Глядач не може завантажувати файли — 403', async () => {
    const file = { originalname: 'a.txt', mimetype: 'text/plain', size: 1, buffer: Buffer.from('a') };
    await assert.rejects(service.upload(viewer, 2, file), { statusCode: 403 });
  });
});
