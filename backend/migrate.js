const db = require('./db');

const migrate = async () => {
  try {
    console.log('Початок міграції БД...');

    // 1. Таблиця items (збережена для 1-ї лаби)
    await db.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);

    // 2. Користувачі (User)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      );
    `);

    // 3. Сторінки нотатника (Page)
    await db.query(`
      CREATE TABLE IF NOT EXISTS pages (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
        icon VARCHAR(50),
        parent_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    // 4. Блоки вмісту сторінки (Block)
    await db.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id SERIAL PRIMARY KEY,
        page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'paragraph',
        content TEXT DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
      );
    `);

    // --- Початкові тестові дані (Seed) ---
    await db.query(`
      INSERT INTO items (name)
      SELECT 'test1' WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'test1');
    `);

    await db.query(`
      INSERT INTO users (name, email)
      VALUES ('Студент', 'student@notion.local')
      ON CONFLICT (email) DO NOTHING;
    `);

    await db.query(`
      INSERT INTO pages (title, icon)
      SELECT 'Головна нотатка', '📝'
      WHERE NOT EXISTS (SELECT 1 FROM pages WHERE title = 'Головна нотатка');
    `);

    await db.query(`
      INSERT INTO blocks (page_id, type, content, position)
      SELECT p.id, 'paragraph', 'Привіт! Це мій перший блок у нотатнику.', 0
      FROM pages p
      WHERE p.title = 'Головна нотатка'
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE page_id = p.id);
    `);

    console.log('Міграція успішно завершена!');
  } catch (error) {
    console.error('Помилка міграції:', error);
  } finally {
    await db.end();
  }
};

migrate();