const defaultDb = require('../db');

const MEMBER_SELECT = `
  SELECT m.user_id AS "userId", m.workspace_id AS "workspaceId", u.name, u.email,
         m.role, m.position_id AS "positionId", m.joined_at AS "joinedAt"
  FROM workspace_members m
  JOIN users u ON u.id = m.user_id
`;

class MemberRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  async find(workspaceId, userId) {
    const { rows } = await this.db.query(
      `${MEMBER_SELECT} WHERE m.workspace_id = $1 AND m.user_id = $2`,
      [workspaceId, userId],
    );
    return rows[0] || null;
  }

  // Перший простір користувача (у нашій моделі користувач працює в одній компанії)
  async findFirstForUser(userId) {
    const { rows } = await this.db.query(
      `${MEMBER_SELECT} WHERE m.user_id = $1 ORDER BY m.joined_at LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  }

  async list(workspaceId) {
    const { rows } = await this.db.query(
      `${MEMBER_SELECT} WHERE m.workspace_id = $1
       ORDER BY array_position(ARRAY['owner','admin','editor','viewer']::varchar[], m.role), u.name`,
      [workspaceId],
    );
    return rows;
  }

  async add(workspaceId, userId, role, positionId = null) {
    await this.db.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role, position_id) VALUES ($1, $2, $3, $4)',
      [workspaceId, userId, role, positionId],
    );
    return this.find(workspaceId, userId);
  }

  async update(workspaceId, userId, { role, positionId }) {
    const { rowCount } = await this.db.query(
      `UPDATE workspace_members
       SET role = COALESCE($3, role),
           position_id = CASE WHEN $4::boolean THEN $5::int ELSE position_id END
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId, role ?? null, positionId !== undefined, positionId ?? null],
    );
    return rowCount > 0 ? this.find(workspaceId, userId) : null;
  }

  async remove(workspaceId, userId) {
    const { rowCount } = await this.db.query(
      'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId],
    );
    return rowCount > 0;
  }

  async countOwners(workspaceId) {
    const { rows } = await this.db.query(
      "SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'",
      [workspaceId],
    );
    return rows[0].n;
  }
}

module.exports = MemberRepository;
