const defaultDb = require('../db');
const withTransaction = require('./transaction');

const WS_FIELDS = 'id, name, slug, created_at AS "createdAt"';

class WorkspaceRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${WS_FIELDS} FROM workspaces WHERE id = $1`, [id]);
    return rows[0] || null;
  }

  async slugExists(slug) {
    const { rowCount } = await this.db.query('SELECT 1 FROM workspaces WHERE slug = $1', [slug]);
    return rowCount > 0;
  }

  // Реєстрація компанії: простір + користувач-власник + членство — однією транзакцією
  async createWithOwner({ name, slug, owner }) {
    return withTransaction(this.db, async (client) => {
      const ws = await client.query(
        `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING ${WS_FIELDS}`,
        [name, slug],
      );
      const user = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, lower($2), $3)
         RETURNING id, name, email, created_at AS "createdAt"`,
        [owner.name, owner.email, owner.passwordHash],
      );
      await client.query(
        "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
        [ws.rows[0].id, user.rows[0].id],
      );
      return { workspace: ws.rows[0], user: user.rows[0] };
    });
  }

  async rename(id, name) {
    const { rows } = await this.db.query(
      `UPDATE workspaces SET name = $2 WHERE id = $1 RETURNING ${WS_FIELDS}`,
      [id, name],
    );
    return rows[0] || null;
  }

  async stats(id) {
    const { rows } = await this.db.query(
      `SELECT
         (SELECT count(*) FROM pages WHERE workspace_id = $1 AND NOT is_archived)::int AS pages,
         (SELECT count(*) FROM attachments WHERE workspace_id = $1)::int AS documents,
         (SELECT count(*) FROM workspace_members WHERE workspace_id = $1)::int AS members,
         (SELECT count(*) FROM departments WHERE workspace_id = $1)::int AS departments,
         (SELECT count(*) FROM positions WHERE workspace_id = $1)::int AS positions`,
      [id],
    );
    return rows[0];
  }
}

module.exports = WorkspaceRepository;
