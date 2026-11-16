const defaultDb = require('../db');

const USER_FIELDS = 'id, name, email, password_hash AS "passwordHash", created_at AS "createdAt"';

class UserRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  async findByEmail(email) {
    const { rows } = await this.db.query(
      `SELECT ${USER_FIELDS} FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] || null;
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  }

  async create({ name, email, passwordHash }, client = this.db) {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, lower($2), $3) RETURNING ${USER_FIELDS}`,
      [name, email, passwordHash],
    );
    return rows[0];
  }
}

module.exports = UserRepository;
