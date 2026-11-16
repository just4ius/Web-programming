// Блок — атомарна одиниця вмісту сторінки (абзац, заголовок, пункт списку, таблиця...)
const BLOCK_TYPES = [
  'h1', 'h2', 'h3', 'paragraph', 'bullet', 'numbered', 'todo',
  'quote', 'callout', 'code', 'divider', 'table',
];

const MAX_CONTENT_LENGTH = 20000;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLS = 12;

class Block {
  constructor({ id, type = 'paragraph', content = '', position = 0, data = {} }) {
    this.id = id;
    this.type = type;
    this.content = content;
    this.position = position;
    this.data = data || {};
  }

  updateContent(newContent) {
    this.content = newContent;
  }

  // Повертає текст помилки або null, якщо блок коректний
  validate() {
    if (!BLOCK_TYPES.includes(this.type)) {
      return `Unknown block type "${this.type}"`;
    }
    if (typeof this.content !== 'string') {
      return 'Block content must be a string';
    }
    if (this.content.length > MAX_CONTENT_LENGTH) {
      return `Block content cannot exceed ${MAX_CONTENT_LENGTH} characters`;
    }
    if (this.type === 'todo' && this.data.checked !== undefined && typeof this.data.checked !== 'boolean') {
      return 'Todo block "checked" must be boolean';
    }
    if (this.type === 'table') {
      const rows = this.data.rows;
      const isGrid = Array.isArray(rows)
        && rows.length > 0
        && rows.length <= MAX_TABLE_ROWS
        && rows.every((row) => Array.isArray(row)
          && row.length > 0
          && row.length <= MAX_TABLE_COLS
          && row.every((cell) => typeof cell === 'string' && cell.length <= 1000));
      if (!isGrid) {
        return `Table block must have data.rows: 1–${MAX_TABLE_ROWS} rows of 1–${MAX_TABLE_COLS} string cells`;
      }
    }
    return null;
  }
}

Block.TYPES = BLOCK_TYPES;

module.exports = Block;
