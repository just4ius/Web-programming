// Відділи та посади компанії
const defaultDb = require('../db');

const DEPT_FIELDS = `id, workspace_id AS "workspaceId", parent_id AS "parentId", name, description, position`;
const POS_FIELDS = `
  id, workspace_id AS "workspaceId", department_id AS "departmentId", title, responsibilities,
  headcount, instruction_page_id AS "instructionPageId"
`;

function buildUpdate(columns, fields, startValues) {
  const sets = [];
  const values = [...startValues];
  for (const [key, column] of Object.entries(columns)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  return { sets, values };
}

class OrgRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  async listDepartments(workspaceId) {
    const { rows } = await this.db.query(
      `SELECT ${DEPT_FIELDS} FROM departments WHERE workspace_id = $1
       ORDER BY parent_id NULLS FIRST, position, id`,
      [workspaceId],
    );
    return rows;
  }

  async getDepartment(workspaceId, id) {
    const { rows } = await this.db.query(
      `SELECT ${DEPT_FIELDS} FROM departments WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    return rows[0] || null;
  }

  async createDepartment({ workspaceId, parentId, name, description }) {
    const { rows } = await this.db.query(
      `INSERT INTO departments (workspace_id, parent_id, name, description, position)
       VALUES ($1, $2, $3, $4,
         (SELECT COALESCE(MAX(position) + 1, 0) FROM departments
          WHERE workspace_id = $1 AND parent_id IS NOT DISTINCT FROM $2))
       RETURNING ${DEPT_FIELDS}`,
      [workspaceId, parentId, name, description],
    );
    return rows[0];
  }

  async updateDepartment(workspaceId, id, fields) {
    const { sets, values } = buildUpdate(
      { name: 'name', description: 'description', parentId: 'parent_id' }, fields, [workspaceId, id],
    );
    if (sets.length === 0) return this.getDepartment(workspaceId, id);
    const { rows } = await this.db.query(
      `UPDATE departments SET ${sets.join(', ')} WHERE workspace_id = $1 AND id = $2 RETURNING ${DEPT_FIELDS}`,
      values,
    );
    return rows[0] || null;
  }

  async deleteDepartment(workspaceId, id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM departments WHERE workspace_id = $1 AND id = $2',
      [workspaceId, id],
    );
    return rowCount > 0;
  }

  async getDepartmentParentMap(workspaceId) {
    const { rows } = await this.db.query(
      'SELECT id, parent_id AS "parentId" FROM departments WHERE workspace_id = $1',
      [workspaceId],
    );
    return new Map(rows.map((r) => [r.id, r.parentId]));
  }

  async listPositions(workspaceId) {
    const { rows } = await this.db.query(
      `SELECT ${POS_FIELDS} FROM positions WHERE workspace_id = $1 ORDER BY department_id, title`,
      [workspaceId],
    );
    return rows;
  }

  async getPosition(workspaceId, id) {
    const { rows } = await this.db.query(
      `SELECT ${POS_FIELDS} FROM positions WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    return rows[0] || null;
  }

  async createPosition({ workspaceId, departmentId, title, responsibilities, headcount, instructionPageId }) {
    const { rows } = await this.db.query(
      `INSERT INTO positions (workspace_id, department_id, title, responsibilities, headcount, instruction_page_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${POS_FIELDS}`,
      [workspaceId, departmentId, title, responsibilities, headcount, instructionPageId],
    );
    return rows[0];
  }

  async updatePosition(workspaceId, id, fields) {
    const { sets, values } = buildUpdate({
      departmentId: 'department_id',
      title: 'title',
      responsibilities: 'responsibilities',
      headcount: 'headcount',
      instructionPageId: 'instruction_page_id',
    }, fields, [workspaceId, id]);
    if (sets.length === 0) return this.getPosition(workspaceId, id);
    const { rows } = await this.db.query(
      `UPDATE positions SET ${sets.join(', ')} WHERE workspace_id = $1 AND id = $2 RETURNING ${POS_FIELDS}`,
      values,
    );
    return rows[0] || null;
  }

  async deletePosition(workspaceId, id) {
    const { rowCount } = await this.db.query(
      'DELETE FROM positions WHERE workspace_id = $1 AND id = $2',
      [workspaceId, id],
    );
    return rowCount > 0;
  }
}

module.exports = OrgRepository;
