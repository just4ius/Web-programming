const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { User, Page, Block } = require('../domain');

describe('Доменні моделі (Notion Clone)', () => {
  it('створення користувача User', () => {
    const user = new User({ id: 1, name: 'Олександр', email: 'alex@example.com' });
    assert.equal(user.name, 'Олександр');
    assert.equal(user.email, 'alex@example.com');
  });

  it('створення сторінки Page та додавання блоків (addBlock)', () => {
    const page = new Page({ id: 1, title: 'Мої нотатки' });
    assert.equal(page.title, 'Мої нотатки');
    assert.equal(page.blocks.length, 0);

    const block = page.addBlock({ id: 10, type: 'heading', content: 'Заголовок' });
    assert.equal(page.blocks.length, 1);
    assert.equal(block.content, 'Заголовок');
    assert.equal(block.position, 0);
  });

  it('оновлення вмісту блоку Block (updateContent)', () => {
    const block = new Block({ id: 1, type: 'paragraph', content: 'Старий текст' });
    block.updateContent('Новий оновлений текст');
    assert.equal(block.content, 'Новий оновлений текст');
  });

  it('перейменування та архівація сторінки (archive, restore, rename)', () => {
    const page = new Page({ id: 2, title: 'Чернетка' });
    page.rename('Робочий регламент');
    assert.equal(page.title, 'Робочий регламент');

    assert.equal(page.isArchived, false);
    page.archive();
    assert.equal(page.isArchived, true);
    page.restore();
    assert.equal(page.isArchived, false);
  });
});
