/**
 * Migration runner for Azen's sovereign database (Postgres-Azen).
 *
 * Adapted from Binah's pattern. Tracks applied migrations in azen_migrations
 * so re-runs are idempotent. Fails loudly on any migration error.
 *
 * Run via: npm run migrate
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function runMigrations() {
  const databaseUrl =
    process.env.DATABASE_PRIVATE_URL ||
    process.env.DATABASE_URL ||
    process.env.AZEN_DATABASE_URL;

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL (or DATABASE_PRIVATE_URL or AZEN_DATABASE_URL) required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS azen_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[Azen Migrations] Found ${files.length} migration(s)`);

  const appliedResult = await pool.query(`SELECT filename FROM azen_migrations`);
  const applied = new Set(appliedResult.rows.map(r => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[Azen Migrations] Already applied, skipping: ${file}`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`[Azen Migrations] Running: ${file}`);
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO azen_migrations (filename) VALUES ($1)`, [file]);
      console.log(`[Azen Migrations] Completed: ${file}`);
    } catch (err: any) {
      console.error(`[Azen Migrations] FAILED: ${file}`, err.message);
      throw err;
    }
  }

  console.log('[Azen Migrations] All migrations complete.');
  await pool.end();
}

runMigrations().catch(err => {
  console.error('[Azen Migrations] Fatal error:', err);
  process.exit(1);
});
