const Block = require('./Block');

class Page {
  constructor({
    id,
    title = 'Untitled',
    icon = null,
    parentId = null,
    userId = null,
    isArchived = false,
    blocks = [],
    createdAt = null,
    updatedAt = null,
  }) {
    this.id = id;
    this.title = title;
    this.icon = icon;
    this.parentId = parentId;
    this.userId = userId;
    this.isArchived = Boolean(isArchived);
    this.blocks = blocks.map((b) => (b instanceof Block ? b : new Block(b)));
    this.createdAt = createdAt || new Date().toISOString();
    this.updatedAt = updatedAt || this.createdAt;
  }

  addBlock(blockData) {
    const block = blockData instanceof Block ? blockData : new Block(blockData);
    block.position = this.blocks.length;
    this.blocks.push(block);
    this.updatedAt = new Date().toISOString();
    return block;
  }

  removeBlock(blockId) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
    this.updatedAt = new Date().toISOString();
  }

  rename(newTitle) {
    this.title = newTitle;
    this.updatedAt = new Date().toISOString();
  }

  archive() {
    this.isArchived = true;
    this.updatedAt = new Date().toISOString();
  }

  restore() {
    this.isArchived = false;
    this.updatedAt = new Date().toISOString();
  }

  update({ title, icon, parentId, isArchived }) {
    if (title !== undefined) {
      this.title = title;
    }
    if (icon !== undefined) {
      this.icon = icon;
    }
    if (parentId !== undefined) {
      this.parentId = parentId;
    }
    if (isArchived !== undefined) {
      this.isArchived = Boolean(isArchived);
    }
    this.updatedAt = new Date().toISOString();
  }
}

module.exports = Page;
