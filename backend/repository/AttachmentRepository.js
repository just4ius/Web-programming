const defaultDb = require('../db');

const META_FIELDS = `
  a.id, a.page_id AS "pageId", a.file_name AS "fileName", a.mime_type AS "mimeType",
  a.size_bytes AS "sizeBytes", a.created_at AS "createdAt", u.name AS "uploadedBy"
`;

class AttachmentRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  // Лише метадані — вміст файлу не тягнемо, щоб не вантажити мережу
  async listForPage(workspaceId, pageId) {
    const { rows } = await this.db.query(
      `SELECT ${META_FIELDS} FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.workspace_id = $1 AND a.page_id = $2 ORDER BY a.created_at`,
      [workspaceId, pageId],
    );
    return rows;
  }

  async create({ workspaceId, pageId, fileName, mimeType, sizeBytes, data, userId }) {
    const { rows } = await this.db.query(
      `INSERT INTO attachments (workspace_id, page_id, file_name, mime_type, size_bytes, data, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [workspaceId, pageId, fileName, mimeType, sizeBytes, data, userId],
    );
    return this.findMeta(workspaceId, rows[0].id);
  }

  async findMeta(workspaceId, id) {
    const { rows } = await this.db.query(
      `SELECT ${META_FIELDS} FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.workspace_id = $1 AND a.id = $2`,
      [workspaceId, id],
    );
    return rows[0] || null;
  }

  async findWithData(workspaceId, id) {
    const { rows } = await this.db.query(
      `SELECT id, file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes", data
       FROM attachments WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    return rows[0] || null;
  }

  async delete(workspaceId, id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM attachments WHERE workspace_id = $1 AND id = $2',
      [workspaceId, id],
    );
    return rowCount > 0;
  }
}

module.exports = AttachmentRepository;
