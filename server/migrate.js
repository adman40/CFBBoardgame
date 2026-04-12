const fs = require('fs');
const path = require('path');

const db = require('./db');

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function runMigrations() {
  await ensureMigrationsTable();

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await db.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file]
    );

    if (alreadyApplied.rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file]
      );
    });
    console.log(`Applied migration: ${file}`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
