// Creates/updates the Better Auth tables (user, session, account, verification) in Neon.
// Safe to re-run: only missing tables and columns are added.
import { getMigrations } from 'better-auth/db/migration';
import { authOptions, pool } from './auth.js';
import { STATS_TABLE_SQL } from './stats.js';

try {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(authOptions);

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log('Database schema is already up to date.');
  } else {
    if (toBeCreated.length) console.log('Creating tables:', toBeCreated.map(t => t.table).join(', '));
    if (toBeAdded.length) console.log('Adding columns to:', toBeAdded.map(t => t.table).join(', '));
    await runMigrations();
    console.log('Migration complete.');
  }

  // Game progression lives in our own table next to Better Auth's
  await pool.query(STATS_TABLE_SQL);
  console.log('player_stats table ready.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
