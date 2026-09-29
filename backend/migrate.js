const db = require('./db');

const migrate = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);

    await db.query(`
      INSERT INTO items (name)
      SELECT 'test1' WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'test1');
    `);

    await db.query(`
      INSERT INTO items (name)
      SELECT 'test2' WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'test2');
    `);

    await db.query(`
      INSERT INTO items (name)
      SELECT 'test3' WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'test3');
    `);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await db.end();
  }
};

migrate();