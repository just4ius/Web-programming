const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const PageService = require('../service/PageService');
const PageRepository = require('../repository/PageRepository');
const { ValidationError, NotFoundError } = require('../service/errors');

describe('PageService Unit Tests (Практична 4)', () => {
  let pageRepository;
  let pageService;

  beforeEach(() => {
    // Ізольований in-memory репозиторій для кожного тесту
    pageRepository = new PageRepository({ useMemory: true });
    pageService = new PageService(pageRepository);
  });

  describe('Створення сторінки (createPage)', () => {
    it('Успішний випадок: коректні дані створюють сторінку з відповідними DTO-полями', async () => {
      const inputDto = {
        title: 'Інструкція для онбордингу',
        icon: '📘',
        userId: 1,
      };

      const result = await pageService.createPage(inputDto);

      assert.ok(result.id, 'Сторінка повинна мати згенерований ID');
      assert.equal(result.title, 'Інструкція для онбордингу');
      assert.equal(result.icon, '📘');
      assert.equal(result.userId, 1);
      assert.equal(result.isArchived, false);
      assert.equal(result.parentId, null);
      assert.ok(result.createdAt, 'Повинна бути дата створення');
      assert.ok(result.updatedAt, 'Повинна бути дата оновлення');
    });

    it('Помилковий випадок: відсутнє або порожнє обов’язкове поле title викидає ValidationError', async () => {
      await assert.rejects(
        async () => {
          await pageService.createPage({ title: '', icon: '📄' });
        },
        (err) => {
          assert.ok(err instanceof ValidationError, 'Повинна бути помилка типу ValidationError');
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, 'TITLE_REQUIRED');
          assert.equal(err.details[0].field, 'title');
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await pageService.createPage({ icon: '📄' });
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.equal(err.code, 'TITLE_REQUIRED');
          return true;
        }
      );
    });

    it('Помилковий випадок: неіснуючий parentId призводить до помилки NotFoundError', async () => {
      await assert.rejects(
        async () => {
          await pageService.createPage({ title: 'Дочірня сторінка', parentId: 9999 });
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.equal(err.statusCode, 404);
          assert.equal(err.code, 'PARENT_NOT_FOUND');
          return true;
        }
      );
    });
  });

  describe('Отримання сторінки (getPageById)', () => {
    it('Успішний випадок: знаходить існуючу сторінку за її ID', async () => {
      const created = await pageService.createPage({ title: 'Архітектурний огляд' });
      const found = await pageService.getPageById(created.id);

      assert.deepEqual(found, created);
    });

    it('Помилковий випадок: неіснуючий ID сторінки викидає NotFoundError (404)', async () => {
      await assert.rejects(
        async () => {
          await pageService.getPageById(8888);
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.equal(err.statusCode, 404);
          assert.equal(err.code, 'PAGE_NOT_FOUND');
          return true;
        }
      );
    });

    it('Помилковий випадок: невалідний формат ID (не число або <= 0) викидає ValidationError (400)', async () => {
      await assert.rejects(
        async () => {
          await pageService.getPageById('abc');
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, 'INVALID_ID');
          return true;
        }
      );
    });
  });

  describe('Оновлення сторінки (updatePage)', () => {
    it('Успішний випадок: коректне оновлення заголовка, іконки та стану архівації', async () => {
      const created = await pageService.createPage({ title: 'Початкова чернетка', icon: '📝' });
      const updated = await pageService.updatePage(created.id, {
        title: 'Фінальний регламент',
        icon: '📑',
        isArchived: true,
      });

      assert.equal(updated.id, created.id);
      assert.equal(updated.title, 'Фінальний регламент');
      assert.equal(updated.icon, '📑');
      assert.equal(updated.isArchived, true);
    });

    it('Помилковий випадок: спроба встановити сторінку батьком для самої себе викидає ValidationError', async () => {
      const created = await pageService.createPage({ title: 'Тестова сторінка' });

      await assert.rejects(
        async () => {
          await pageService.updatePage(created.id, { parentId: created.id });
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.equal(err.code, 'CIRCULAR_PARENT');
          assert.equal(err.details[0].field, 'parentId');
          return true;
        }
      );
    });
  });

  describe('Видалення сторінки (deletePage)', () => {
    it('Успішний випадок: сторінка видаляється зі сховища', async () => {
      const created = await pageService.createPage({ title: 'Сторінка для видалення' });
      const deleted = await pageService.deletePage(created.id);
      assert.equal(deleted, true);

      // Перевіряємо, що після видалення сторінка більше не знаходиться
      await assert.rejects(
        async () => {
          await pageService.getPageById(created.id);
        },
        (err) => err instanceof NotFoundError
      );
    });
  });
});
