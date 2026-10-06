class Block {
  constructor({ id, type = 'paragraph', content = '', position = 0 }) {
    this.id = id;
    this.type = type;
    this.content = content;
    this.position = position;
  }

  updateContent(newContent) {
    this.content = newContent;
  }
}

module.exports = Block;
