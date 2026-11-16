// Запуск міграцій PostgreSQL.
//   npm run migrate            — застосувати нові міграції з database/migrations
//   npm run migrate -- --seed  — те саме + демо-дані з database/seeds
// Кожна міграція виконується один раз (облік у таблиці schema_migrations) і в транзакції:
// якщо в файлі помилка, база залишається в попередньому стані.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'database', 'migrations');
const SEEDS_DIR = path.join(__dirname, 'database', 'seeds');

function sqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

async function runInTransaction(client, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// Будь-яке число: «замок» на час міграції, щоб кілька подів у Kubernetes не мігрували одночасно
const MIGRATION_LOCK_ID = 7262024;

async function migrate({ seed = false } = {}) {
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    for (const file of sqlFiles(MIGRATIONS_DIR)) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await runInTransaction(client, `${sql}\nINSERT INTO schema_migrations (version) VALUES ('${file}');`);
      console.log(`✔ міграція ${file}`);
    }

    if (seed) {
      for (const file of sqlFiles(SEEDS_DIR)) {
        await runInTransaction(client, fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
        console.log(`✔ сид ${file}`);
      }
    }

    console.log('Міграція успішно завершена!');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

if (require.main === module) {
  migrate({ seed: process.argv.includes('--seed') })
    .then(() => db.end())
    .catch(async (err) => {
      console.error('Помилка міграції:', err.message);
      await db.end();
      process.exit(1);
    });
}

module.exports = migrate;
