const Block = require('./Block');

class Page {
  constructor({ id, title = 'Untitled', icon = null, parentId = null, userId = null, blocks = [] }) {
    this.id = id;
    this.title = title;
    this.icon = icon;
    this.parentId = parentId;
    this.userId = userId;
    this.isArchived = false;
    this.blocks = blocks.map((b) => (b instanceof Block ? b : new Block(b)));
  }

  addBlock(blockData) {
    const block = blockData instanceof Block ? blockData : new Block(blockData);
    block.position = this.blocks.length;
    this.blocks.push(block);
    return block;
  }

  removeBlock(blockId) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
  }

  rename(newTitle) {
    this.title = newTitle;
  }

  archive() {
    this.isArchived = true;
  }

  restore() {
    this.isArchived = false;
  }
}

module.exports = Page;
