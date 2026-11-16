const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Block = require('../domain/Block');
const Workspace = require('../domain/Workspace');
const { can } = require('../domain/Member');
const { wouldCreateCycle } = require('../domain/OrgUnit');

describe('Domain: ролі та права (RBAC)', () => {
  it('Viewer може лише читати', () => {
    assert.equal(can('viewer', 'content:read'), true);
    assert.equal(can('viewer', 'content:write'), false);
  });

  it('Editor редагує контент, але не керує працівниками', () => {
    assert.equal(can('editor', 'content:write'), true);
    assert.equal(can('editor', 'members:manage'), false);
  });

  it('Admin і Owner керують працівниками та оргструктурою', () => {
    assert.equal(can('admin', 'members:manage'), true);
    assert.equal(can('owner', 'org:manage'), true);
  });

  it('Невідома роль або дія — доступ заборонено', () => {
    assert.equal(can('guest', 'content:read'), false);
    assert.equal(can('owner', 'unknown:action'), false);
  });
});

describe('Domain: блоки вмісту', () => {
  it('Коректний абзац проходить перевірку', () => {
    assert.equal(new Block({ type: 'paragraph', content: 'Текст' }).validate(), null);
  });

  it('Невідомий тип блоку — помилка', () => {
    assert.match(new Block({ type: 'video', content: '' }).validate(), /Unknown block type/);
  });

  it('Таблиця має містити прямокутний масив рядків', () => {
    assert.equal(new Block({ type: 'table', data: { rows: [['A', 'B'], ['1', '2']] } }).validate(), null);
    assert.match(new Block({ type: 'table', data: { rows: 'oops' } }).validate(), /Table block/);
  });

  it('Чекбокс todo має бути булевим', () => {
    assert.match(new Block({ type: 'todo', content: 'x', data: { checked: 'yes' } }).validate(), /boolean/);
  });
});

describe('Domain: компанія та дерево', () => {
  it('slugify транслітерує українську назву', () => {
    assert.equal(Workspace.slugify('ТОВ «Пекарня Колосок»'), 'tov-pekarnya-kolosok');
    assert.equal(Workspace.slugify('!!!'), 'company');
  });

  it('wouldCreateCycle забороняє переносити вузол у власного нащадка', () => {
    // 1 → 2 → 3
    const parents = new Map([[1, null], [2, 1], [3, 2]]);
    assert.equal(wouldCreateCycle(1, 3, parents), true);
    assert.equal(wouldCreateCycle(3, 1, parents), false);
    assert.equal(wouldCreateCycle(2, 2, parents), true);
  });
});
