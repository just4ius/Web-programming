const { ValidationError, NotFoundError } = require('./errors');
const PageRepository = require('../repository/PageRepository');

class PageService {
  constructor(pageRepository = new PageRepository()) {
    this.pageRepository = pageRepository;
  }

  toDTO(page) {
    if (!page) return null;
    return {
      id: Number(page.id),
      title: page.title,
      icon: page.icon || null,
      parentId: page.parentId !== null && page.parentId !== undefined ? Number(page.parentId) : null,
      userId: page.userId !== null && page.userId !== undefined ? Number(page.userId) : null,
      isArchived: Boolean(page.isArchived),
      createdAt: page.createdAt || new Date().toISOString(),
      updatedAt: page.updatedAt || new Date().toISOString(),
    };
  }

  async createPage(dto = {}) {
    if (!dto || typeof dto !== 'object') {
      throw new ValidationError('Request body must be a valid JSON object', {
        code: 'INVALID_PAYLOAD',
      });
    }

    if (!dto.title || typeof dto.title !== 'string' || dto.title.trim() === '') {
      throw new ValidationError('Title is required and cannot be empty', {
        code: 'TITLE_REQUIRED',
        field: 'title',
      });
    }

    if (dto.title.length > 255) {
      throw new ValidationError('Title cannot exceed 255 characters', {
        code: 'TITLE_TOO_LONG',
        field: 'title',
      });
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      const parent = await this.pageRepository.getById(dto.parentId);
      if (!parent) {
        throw new NotFoundError(`Parent page with ID ${dto.parentId} does not exist`, {
          code: 'PARENT_NOT_FOUND',
          details: [{ field: 'parentId', message: `Parent page with ID ${dto.parentId} does not exist` }],
        });
      }
    }

    const newPage = await this.pageRepository.create({
      title: dto.title.trim(),
      icon: dto.icon ? String(dto.icon).trim() : null,
      parentId: dto.parentId || null,
      userId: dto.userId || null,
    });

    return this.toDTO(newPage);
  }

  async listPages(filters = {}) {
    const pages = await this.pageRepository.getAll(filters);
    return pages.map((page) => this.toDTO(page));
  }

  async getPageById(id) {
    const pageId = Number(id);
    if (!id || Number.isNaN(pageId) || pageId <= 0) {
      throw new ValidationError('Invalid page ID. It must be a positive integer', {
        code: 'INVALID_ID',
        field: 'id',
      });
    }

    const page = await this.pageRepository.getById(pageId);
    if (!page) {
      throw new NotFoundError(`Page with ID ${pageId} not found`, {
        code: 'PAGE_NOT_FOUND',
      });
    }

    return this.toDTO(page);
  }

  async updatePage(id, dto = {}) {
    const pageId = Number(id);
    if (!id || Number.isNaN(pageId) || pageId <= 0) {
      throw new ValidationError('Invalid page ID. It must be a positive integer', {
        code: 'INVALID_ID',
        field: 'id',
      });
    }

    // Перевірка існування ресурсу
    await this.getPageById(pageId);

    if (dto.title !== undefined) {
      if (typeof dto.title !== 'string' || dto.title.trim() === '') {
        throw new ValidationError('Title cannot be empty', {
          code: 'TITLE_REQUIRED',
          field: 'title',
        });
      }
      if (dto.title.length > 255) {
        throw new ValidationError('Title cannot exceed 255 characters', {
          code: 'TITLE_TOO_LONG',
          field: 'title',
        });
      }
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (Number(dto.parentId) === pageId) {
        throw new ValidationError('A page cannot be its own parent', {
          code: 'CIRCULAR_PARENT',
          field: 'parentId',
        });
      }

      const parent = await this.pageRepository.getById(dto.parentId);
      if (!parent) {
        throw new NotFoundError(`Parent page with ID ${dto.parentId} does not exist`, {
          code: 'PARENT_NOT_FOUND',
          details: [{ field: 'parentId', message: `Parent page with ID ${dto.parentId} does not exist` }],
        });
      }
    }

    const updatePayload = {};
    if (dto.title !== undefined) updatePayload.title = dto.title.trim();
    if (dto.icon !== undefined) updatePayload.icon = dto.icon ? String(dto.icon).trim() : null;
    if (dto.parentId !== undefined) updatePayload.parentId = dto.parentId;
    if (dto.isArchived !== undefined) updatePayload.isArchived = Boolean(dto.isArchived);

    const updatedPage = await this.pageRepository.update(pageId, updatePayload);
    return this.toDTO(updatedPage);
  }

  async deletePage(id) {
    const pageId = Number(id);
    if (!id || Number.isNaN(pageId) || pageId <= 0) {
      throw new ValidationError('Invalid page ID. It must be a positive integer', {
        code: 'INVALID_ID',
        field: 'id',
      });
    }

    // Перевірка існування ресурсу
    await this.getPageById(pageId);

    const deleted = await this.pageRepository.delete(pageId);
    if (!deleted) {
      throw new NotFoundError(`Page with ID ${pageId} not found`, {
        code: 'PAGE_NOT_FOUND',
      });
    }

    return true;
  }
}

module.exports = PageService;
