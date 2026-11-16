// Дерево сторінок, блоки, кошик і пошук у межах однієї компанії (workspace_id)
const defaultDb = require('../db');
const withTransaction = require('./transaction');

const PAGE_FIELDS = `
  id, workspace_id AS "workspaceId", parent_id AS "parentId", title, icon, position,
  is_archived AS "isArchived", created_by AS "createdBy", updated_by AS "updatedBy",
  created_at AS "createdAt", updated_at AS "updatedAt", archived_at AS "archivedAt"
`;

// Рекурсивний запит: сторінка і всі її нащадки
const SUBTREE = `
  WITH RECURSIVE tree AS (
    SELECT id FROM pages WHERE workspace_id = $1 AND id = $2
    UNION ALL
    SELECT p.id FROM pages p JOIN tree t ON p.parent_id = t.id
  )
`;

class KnowledgeRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  async listPages(workspaceId) {
    const { rows } = await this.db.query(
      `SELECT ${PAGE_FIELDS} FROM pages
       WHERE workspace_id = $1 AND NOT is_archived
       ORDER BY parent_id NULLS FIRST, position, id`,
      [workspaceId],
    );
    return rows;
  }

  async getPage(workspaceId, id) {
    const { rows } = await this.db.query(
      `SELECT ${PAGE_FIELDS} FROM pages WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    return rows[0] || null;
  }

  async getBlocks(pageId) {
    const { rows } = await this.db.query(
      'SELECT id, type, content, data, position FROM blocks WHERE page_id = $1 ORDER BY position, id',
      [pageId],
    );
    return rows;
  }

  async getChildren(workspaceId, pageId) {
    const { rows } = await this.db.query(
      `SELECT id, title, icon FROM pages
       WHERE workspace_id = $1 AND parent_id = $2 AND NOT is_archived
       ORDER BY position, id`,
      [workspaceId, pageId],
    );
    return rows;
  }

  // Шлях від кореня до сторінки: [Статутні документи, Статут]
  async getBreadcrumbs(workspaceId, pageId) {
    const { rows } = await this.db.query(
      `WITH RECURSIVE path AS (
         SELECT id, parent_id, title, icon, 0 AS depth FROM pages WHERE workspace_id = $1 AND id = $2
         UNION ALL
         SELECT p.id, p.parent_id, p.title, p.icon, path.depth + 1
         FROM pages p JOIN path ON p.id = path.parent_id
       )
       SELECT id, title, icon FROM path ORDER BY depth DESC`,
      [workspaceId, pageId],
    );
    return rows;
  }

  // Map(id → parentId) для перевірки циклів при переміщенні
  async getParentMap(workspaceId) {
    const { rows } = await this.db.query(
      'SELECT id, parent_id AS "parentId" FROM pages WHERE workspace_id = $1',
      [workspaceId],
    );
    return new Map(rows.map((r) => [r.id, r.parentId]));
  }

  async nextPosition(workspaceId, parentId) {
    const { rows } = await this.db.query(
      `SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM pages
       WHERE workspace_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
      [workspaceId, parentId],
    );
    return rows[0].pos;
  }

  async createPage({ workspaceId, parentId, title, icon, position, userId }) {
    const { rows } = await this.db.query(
      `INSERT INTO pages (workspace_id, parent_id, title, icon, position, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING ${PAGE_FIELDS}`,
      [workspaceId, parentId, title, icon, position, userId],
    );
    return rows[0];
  }

  // fields — лише ті поля, які треба змінити: { title?, icon?, parentId?, position? }
  async updatePage(workspaceId, id, fields, userId) {
    const columns = { title: 'title', icon: 'icon', parentId: 'parent_id', position: 'position' };
    const sets = ['updated_by = $3'];
    const values = [workspaceId, id, userId];
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        values.push(fields[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    const { rows } = await this.db.query(
      `UPDATE pages SET ${sets.join(', ')}
       WHERE workspace_id = $1 AND id = $2
       RETURNING ${PAGE_FIELDS}`,
      values,
    );
    return rows[0] || null;
  }

  // Збереження сторінки: старі блоки видаляються, нові записуються в одній транзакції
  async replaceBlocks(workspaceId, pageId, blocks, userId) {
    return withTransaction(this.db, async (client) => {
      await client.query('DELETE FROM blocks WHERE page_id = $1', [pageId]);
      for (const [index, block] of blocks.entries()) {
        await client.query(
          'INSERT INTO blocks (page_id, type, content, data, position) VALUES ($1, $2, $3, $4, $5)',
          [pageId, block.type, block.content, JSON.stringify(block.data || {}), index],
        );
      }
      await client.query(
        'UPDATE pages SET updated_by = $3 WHERE workspace_id = $1 AND id = $2',
        [workspaceId, pageId, userId],
      );
      const { rows } = await client.query(
        'SELECT id, type, content, data, position FROM blocks WHERE page_id = $1 ORDER BY position',
        [pageId],
      );
      return rows;
    });
  }

  // М'яке видалення: сторінка з усіма підсторінками переходить у кошик
  async archiveTree(workspaceId, id, userId) {
    const { rowCount } = await this.db.query(
      `${SUBTREE}
       UPDATE pages SET is_archived = TRUE, archived_at = now(), updated_by = $3
       WHERE id IN (SELECT id FROM tree) AND NOT is_archived`,
      [workspaceId, id, userId],
    );
    return rowCount;
  }

  async restoreTree(workspaceId, id, userId) {
    return withTransaction(this.db, async (client) => {
      // Якщо батьківська сторінка теж у кошику — відновлюємо в корінь дерева
      await client.query(
        `UPDATE pages p SET parent_id = NULL
         WHERE p.workspace_id = $1 AND p.id = $2
           AND EXISTS (SELECT 1 FROM pages parent WHERE parent.id = p.parent_id AND parent.is_archived)`,
        [workspaceId, id],
      );
      const { rowCount } = await client.query(
        `${SUBTREE}
         UPDATE pages SET is_archived = FALSE, archived_at = NULL, updated_by = $3
         WHERE id IN (SELECT id FROM tree)`,
        [workspaceId, id, userId],
      );
      return rowCount;
    });
  }

  // Кошик: лише «верхні» видалені сторінки (їхні підсторінки відновлюються разом із ними)
  async listTrash(workspaceId) {
    const { rows } = await this.db.query(
      `SELECT p.id, p.title, p.icon, p.archived_at AS "archivedAt",
              (SELECT count(*)::int FROM pages c WHERE c.parent_id = p.id) AS "childCount"
       FROM pages p
       WHERE p.workspace_id = $1 AND p.is_archived
         AND (p.parent_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM pages parent WHERE parent.id = p.parent_id AND parent.is_archived))
       ORDER BY p.archived_at DESC`,
      [workspaceId],
    );
    return rows;
  }

  async purge(workspaceId, id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM pages WHERE workspace_id = $1 AND id = $2 AND is_archived',
      [workspaceId, id],
    );
    return rowCount > 0;
  }

  // Пошук підрядка в назвах, тексті блоків, клітинках таблиць і назвах файлів
  async search(workspaceId, query) {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const { rows } = await this.db.query(
      `SELECT p.id, p.title, p.icon, p.updated_at AS "updatedAt",
              (SELECT b.content FROM blocks b
               WHERE b.page_id = p.id AND b.content ILIKE $2
               ORDER BY b.position LIMIT 1) AS "matchedText",
              (SELECT a.file_name FROM attachments a
               WHERE a.page_id = p.id AND a.file_name ILIKE $2 LIMIT 1) AS "matchedFile",
              p.title ILIKE $2 AS "titleMatch"
       FROM pages p
       WHERE p.workspace_id = $1 AND NOT p.is_archived
         AND (p.title ILIKE $2
              OR EXISTS (SELECT 1 FROM blocks b WHERE b.page_id = p.id
                         AND (b.content ILIKE $2 OR (b.type = 'table' AND b.data::text ILIKE $2)))
              OR EXISTS (SELECT 1 FROM attachments a WHERE a.page_id = p.id AND a.file_name ILIKE $2))
       ORDER BY "titleMatch" DESC, p.updated_at DESC
       LIMIT 30`,
      [workspaceId, pattern],
    );
    return rows;
  }
}

module.exports = KnowledgeRepository;
