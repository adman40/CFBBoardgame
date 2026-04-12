const { Pool } = require('pg');

let pool = null;

function getSslConfig() {
  if (process.env.DATABASE_SSL === 'true') {
    return { rejectUnauthorized: false };
  }
  return false;
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: getSslConfig(),
    });
  }

  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function checkHealth() {
  await query('SELECT 1');
}

module.exports = {
  getPool,
  query,
  withTransaction,
  checkHealth,
};
