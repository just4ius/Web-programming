const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || process.env.PGUSER || 'postgres',
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  database: process.env.DB_NAME || process.env.PGDATABASE || 'postgres',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD || '',
  port: Number(process.env.DB_PORT || process.env.PGPORT) || 5432,
});

module.exports = pool;