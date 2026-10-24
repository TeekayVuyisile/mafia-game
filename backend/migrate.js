// Creates/updates the Better Auth tables (user, session, account, verification) in Neon.
// Safe to re-run: only missing tables and columns are added.
import { getMigrations } from 'better-auth/db/migration';
import { authOptions, pool } from './auth.js';

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
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
