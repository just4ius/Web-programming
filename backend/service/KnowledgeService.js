// База знань компанії: дерево сторінок, блоки, кошик, пошук
const Block = require('../domain/Block');
const { wouldCreateCycle } = require('../domain/OrgUnit');
const { ValidationError, NotFoundError } = require('./errors');
const v = require('./validate');

const MAX_BLOCKS_PER_PAGE = 500;

class KnowledgeService {
  constructor({ knowledgeRepository, attachmentRepository }) {
    this.repo = knowledgeRepository;
    this.attachments = attachmentRepository;
  }

  async listPages(actor) {
    v.requirePermission(actor, 'content:read');
    return this.repo.listPages(actor.workspaceId);
  }

  async findActivePage(actor, id, field = 'id') {
    const page = await this.repo.getPage(actor.workspaceId, v.id(id, field));
    if (!page || page.isArchived) {
      throw new NotFoundError(`Page ${id} not found`, { code: 'PAGE_NOT_FOUND' });
    }
    return page;
  }

  // Сторінка з усім потрібним для відображення: блоки, файли, шлях, підсторінки
  async getPage(actor, id) {
    v.requirePermission(actor, 'content:read');
    const page = await this.findActivePage(actor, id);
    const [blocks, attachments, breadcrumbs, children] = await Promise.all([
      this.repo.getBlocks(page.id),
      this.attachments.listForPage(actor.workspaceId, page.id),
      this.repo.getBreadcrumbs(actor.workspaceId, page.id),
      this.repo.getChildren(actor.workspaceId, page.id),
    ]);
    return { ...page, blocks, attachments, breadcrumbs, children };
  }

  validateIcon(icon) {
    if (icon === undefined) return undefined;
    if (icon === null || icon === '') return null;
    return v.text(icon, 'icon', { min: 1, max: 16, code: 'ICON_INVALID' });
  }

  async createPage(actor, dto) {
    v.requirePermission(actor, 'content:write');
    v.body(dto);
    const title = v.text(dto.title, 'title', { min: 1, max: 255, code: 'TITLE_REQUIRED' });
    const icon = this.validateIcon(dto.icon) ?? null;
    const parentId = dto.parentId == null ? null : (await this.findActivePage(actor, dto.parentId, 'parentId')).id;

    return this.repo.createPage({
      workspaceId: actor.workspaceId,
      parentId,
      title,
      icon,
      position: await this.repo.nextPosition(actor.workspaceId, parentId),
      userId: actor.id,
    });
  }

  async updatePage(actor, id, dto) {
    v.requirePermission(actor, 'content:write');
    v.body(dto);
    const page = await this.findActivePage(actor, id);
    const fields = {
      title: dto.title !== undefined ? v.text(dto.title, 'title', { min: 1, max: 255, code: 'TITLE_REQUIRED' }) : undefined,
      icon: this.validateIcon(dto.icon),
    };

    // Переміщення в іншу гілку дерева
    if (dto.parentId !== undefined) {
      const parentId = dto.parentId === null ? null : (await this.findActivePage(actor, dto.parentId, 'parentId')).id;
      const parentMap = await this.repo.getParentMap(actor.workspaceId);
      if (parentId !== null && wouldCreateCycle(page.id, parentId, parentMap)) {
        throw new ValidationError('A page cannot be moved inside itself or its subpages', {
          code: 'PAGE_CYCLE', field: 'parentId',
        });
      }
      if (parentId !== page.parentId) {
        fields.parentId = parentId;
        fields.position = await this.repo.nextPosition(actor.workspaceId, parentId);
      }
    }
    if (dto.position !== undefined) {
      const position = Number(dto.position);
      if (!Number.isInteger(position) || position < 0) {
        throw new ValidationError('Position must be a non-negative integer', { code: 'INVALID_POSITION', field: 'position' });
      }
      fields.position = position;
    }

    return this.repo.updatePage(actor.workspaceId, page.id, fields, actor.id);
  }

  // Збереження вмісту сторінки: приходить увесь список блоків по порядку
  async saveBlocks(actor, id, blocks) {
    v.requirePermission(actor, 'content:write');
    const page = await this.findActivePage(actor, id);
    if (!Array.isArray(blocks) || blocks.length > MAX_BLOCKS_PER_PAGE) {
      throw new ValidationError(`"blocks" must be an array of up to ${MAX_BLOCKS_PER_PAGE} items`, {
        code: 'INVALID_BLOCKS', field: 'blocks',
      });
    }
    const clean = blocks.map((raw, index) => {
      const block = new Block({
        type: raw && raw.type,
        content: raw && raw.content !== undefined ? raw.content : '',
        data: raw && raw.data && typeof raw.data === 'object' ? raw.data : {},
      });
      const error = block.validate();
      if (error) {
        throw new ValidationError(`Block #${index + 1}: ${error}`, { code: 'INVALID_BLOCK', field: `blocks[${index}]` });
      }
      // Зберігаємо лише відомі властивості, щоб у базу не потрапило зайве
      const data = block.type === 'todo' ? { checked: Boolean(block.data.checked) }
        : block.type === 'table' ? { rows: block.data.rows }
          : {};
      return { type: block.type, content: block.type === 'divider' ? '' : block.content, data };
    });
    return this.repo.replaceBlocks(actor.workspaceId, page.id, clean, actor.id);
  }

  async archivePage(actor, id) {
    v.requirePermission(actor, 'content:write');
    const page = await this.findActivePage(actor, id);
    const count = await this.repo.archiveTree(actor.workspaceId, page.id, actor.id);
    return { archived: count };
  }

  async listTrash(actor) {
    v.requirePermission(actor, 'content:write');
    return this.repo.listTrash(actor.workspaceId);
  }

  async findArchived(actor, id) {
    const page = await this.repo.getPage(actor.workspaceId, v.id(id, 'id'));
    if (!page || !page.isArchived) {
      throw new NotFoundError(`Page ${id} is not in trash`, { code: 'NOT_IN_TRASH' });
    }
    return page;
  }

  async restorePage(actor, id) {
    v.requirePermission(actor, 'content:write');
    const page = await this.findArchived(actor, id);
    const count = await this.repo.restoreTree(actor.workspaceId, page.id, actor.id);
    return { restored: count };
  }

  async purgePage(actor, id) {
    v.requirePermission(actor, 'trash:purge');
    const page = await this.findArchived(actor, id);
    await this.repo.purge(actor.workspaceId, page.id);
  }

  async search(actor, query) {
    v.requirePermission(actor, 'content:read');
    const q = typeof query === 'string' ? query.trim() : '';
    if (q.length < 2 || q.length > 100) {
      throw new ValidationError('Search query must be 2–100 characters long', { code: 'INVALID_QUERY', field: 'q' });
    }
    const rows = await this.repo.search(actor.workspaceId, q);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon,
      updatedAt: r.updatedAt,
      snippet: r.matchedText ? KnowledgeService.snippet(r.matchedText, q)
        : r.matchedFile ? `Файл: ${r.matchedFile}`
          : r.titleMatch ? null : 'Збіг у таблиці',
    }));
  }

  // Шматок тексту навколо знайденого слова: «…подається не пізніше ніж за 2 тижні…»
  static snippet(text, query, radius = 60) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text.slice(0, radius * 2);
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + query.length + radius);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }
}

module.exports = KnowledgeService;
