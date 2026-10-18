const db = require('../db');
const Page = require('../domain/Page');

class PageRepository {
  constructor({ useMemory = false } = {}) {
    this.useMemory = useMemory;
    this.memoryPages = new Map();
    this.currentId = 1;
  }

  async getAll({ isArchived = null, parentId = null } = {}) {
    if (this.useMemory) {
      let pages = Array.from(this.memoryPages.values());
      if (isArchived !== null && isArchived !== undefined) {
        pages = pages.filter((p) => p.isArchived === Boolean(isArchived));
      }
      if (parentId !== null && parentId !== undefined) {
        pages = pages.filter((p) => p.parentId === Number(parentId));
      }
      return pages.sort((a, b) => a.id - b.id);
    }

    try {
      const conditions = [];
      const values = [];

      if (isArchived !== null && isArchived !== undefined) {
        values.push(Boolean(isArchived));
        conditions.push(`is_archived = $${values.length}`);
      }

      if (parentId !== null && parentId !== undefined) {
        values.push(Number(parentId));
        conditions.push(`parent_id = $${values.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const query = `
        SELECT id, title, icon, parent_id AS "parentId", user_id AS "userId", is_archived AS "isArchived"
        FROM pages
        ${whereClause}
        ORDER BY id ASC
      `;

      const result = await db.query(query, values);
      return result.rows.map((row) => new Page(row));
    } catch (err) {
      console.warn('DB connection failed in PageRepository, falling back to in-memory mode:', err.message);
      this.useMemory = true;
      return this.getAll({ isArchived, parentId });
    }
  }

  async getById(id) {
    const pageId = Number(id);

    if (this.useMemory) {
      return this.memoryPages.get(pageId) || null;
    }

    try {
      const query = `
        SELECT id, title, icon, parent_id AS "parentId", user_id AS "userId", is_archived AS "isArchived"
        FROM pages
        WHERE id = $1
      `;
      const result = await db.query(query, [pageId]);
      if (result.rows.length === 0) {
        return null;
      }
      return new Page(result.rows[0]);
    } catch (err) {
      console.warn('DB connection failed in PageRepository, falling back to in-memory mode:', err.message);
      this.useMemory = true;
      return this.getById(id);
    }
  }

  async create(pageData) {
    if (this.useMemory) {
      const id = this.currentId++;
      const page = new Page({
        id,
        title: pageData.title,
        icon: pageData.icon || null,
        parentId: pageData.parentId ? Number(pageData.parentId) : null,
        userId: pageData.userId ? Number(pageData.userId) : null,
        isArchived: false,
      });
      this.memoryPages.set(id, page);
      return page;
    }

    try {
      const query = `
        INSERT INTO pages (title, icon, parent_id, user_id, is_archived)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, icon, parent_id AS "parentId", user_id AS "userId", is_archived AS "isArchived"
      `;
      const values = [
        pageData.title,
        pageData.icon || null,
        pageData.parentId ? Number(pageData.parentId) : null,
        pageData.userId ? Number(pageData.userId) : null,
        false,
      ];
      const result = await db.query(query, values);
      return new Page(result.rows[0]);
    } catch (err) {
      console.warn('DB connection failed in PageRepository, falling back to in-memory mode:', err.message);
      this.useMemory = true;
      return this.create(pageData);
    }
  }

  async update(id, updateData) {
    const pageId = Number(id);

    if (this.useMemory) {
      const page = this.memoryPages.get(pageId);
      if (!page) {
        return null;
      }
      page.update(updateData);
      return page;
    }

    try {
      const query = `
        UPDATE pages
        SET title = COALESCE($1, title),
            icon = $2,
            parent_id = $3,
            is_archived = COALESCE($4, is_archived)
        WHERE id = $5
        RETURNING id, title, icon, parent_id AS "parentId", user_id AS "userId", is_archived AS "isArchived"
      `;
      const values = [
        updateData.title,
        updateData.icon !== undefined ? updateData.icon : null,
        updateData.parentId !== undefined ? updateData.parentId : null,
        updateData.isArchived !== undefined ? Boolean(updateData.isArchived) : null,
        pageId,
      ];
      const result = await db.query(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      return new Page(result.rows[0]);
    } catch (err) {
      console.warn('DB connection failed in PageRepository, falling back to in-memory mode:', err.message);
      this.useMemory = true;
      return this.update(id, updateData);
    }
  }

  async delete(id) {
    const pageId = Number(id);

    if (this.useMemory) {
      return this.memoryPages.delete(pageId);
    }

    try {
      const query = 'DELETE FROM pages WHERE id = $1 RETURNING id';
      const result = await db.query(query, [pageId]);
      return result.rowCount > 0;
    } catch (err) {
      console.warn('DB connection failed in PageRepository, falling back to in-memory mode:', err.message);
      this.useMemory = true;
      return this.delete(id);
    }
  }
}

module.exports = PageRepository;
