import { pool } from './auth.js';

// Among Us-style progression: XP fills levels, levels unlock mafia ranks
const XP_PER_LEVEL = 250;
const XP_FOR_PLAYING = 20;
const XP_FOR_WIN = 80;
const XP_FOR_SURVIVING = 20;

const RANKS = [
  { level: 1, title: 'Street Rat' },
  { level: 3, title: 'Associate' },
  { level: 6, title: 'Soldier' },
  { level: 10, title: 'Capo' },
  { level: 15, title: 'Underboss' },
  { level: 20, title: 'Consigliere' },
  { level: 30, title: 'Don' }
];

export const STATS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS player_stats (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    mafia_wins INTEGER NOT NULL DEFAULT 0,
    civilian_wins INTEGER NOT NULL DEFAULT 0,
    medic_wins INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS player_stats_xp_idx ON player_stats (xp DESC);
  ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS detective_wins INTEGER NOT NULL DEFAULT 0;
`;

export function describeProgress(xp = 0) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const rank = [...RANKS].reverse().find(r => level >= r.level);
  const nextRank = RANKS.find(r => r.level > level) || null;
  return {
    level,
    rank: rank.title,
    nextRank: nextRank && { title: nextRank.title, level: nextRank.level },
    xpIntoLevel: xp % XP_PER_LEVEL,
    xpPerLevel: XP_PER_LEVEL
  };
}

function formatStats(row) {
  const stats = {
    gamesPlayed: row?.games_played ?? 0,
    wins: row?.wins ?? 0,
    xp: row?.xp ?? 0,
    mafiaWins: row?.mafia_wins ?? 0,
    civilianWins: row?.civilian_wins ?? 0,
    medicWins: row?.medic_wins ?? 0,
    detectiveWins: row?.detective_wins ?? 0
  };
  return { ...stats, losses: stats.gamesPlayed - stats.wins, ...describeProgress(stats.xp) };
}

export async function getStats(userId) {
  const { rows } = await pool.query('SELECT * FROM player_stats WHERE user_id = $1', [userId]);
  return formatStats(rows[0]);
}

// Profile data shown to other players in a room
export async function getPlayerProfile(userId) {
  const { rows } = await pool.query(
    `SELECT u.name, u.image, COALESCE(s.xp, 0) AS xp
       FROM "user" u LEFT JOIN player_stats s ON s.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  if (!rows[0]) return null;
  return { name: rows[0].name, image: rows[0].image, level: describeProgress(rows[0].xp).level };
}

export async function getLeaderboard(limit = 10) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.image, s.*
       FROM player_stats s JOIN "user" u ON u.id = s.user_id
      ORDER BY s.xp DESC, s.wins DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map(row => ({ userId: row.id, name: row.name, image: row.image, ...formatStats(row) }));
}

export function xpForResult({ won, survived }) {
  return XP_FOR_PLAYING + (won ? XP_FOR_WIN : 0) + (survived ? XP_FOR_SURVIVING : 0);
}

// results: [{ userId, role, won, survived }]
export async function recordGameResults(results) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { userId, role, won, survived } of results) {
      const xp = xpForResult({ won, survived });
      await client.query(
        `INSERT INTO player_stats (user_id, games_played, wins, xp, mafia_wins, civilian_wins, medic_wins, detective_wins)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           games_played = player_stats.games_played + 1,
           wins = player_stats.wins + EXCLUDED.wins,
           xp = player_stats.xp + EXCLUDED.xp,
           mafia_wins = player_stats.mafia_wins + EXCLUDED.mafia_wins,
           civilian_wins = player_stats.civilian_wins + EXCLUDED.civilian_wins,
           medic_wins = player_stats.medic_wins + EXCLUDED.medic_wins,
           detective_wins = player_stats.detective_wins + EXCLUDED.detective_wins,
           updated_at = now()`,
        [
          userId,
          won ? 1 : 0,
          xp,
          won && role === 'Mafia' ? 1 : 0,
          won && role === 'Civilian' ? 1 : 0,
          won && role === 'Medic' ? 1 : 0,
          won && role === 'Detective' ? 1 : 0
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStats(userId) {
  await pool.query('DELETE FROM player_stats WHERE user_id = $1', [userId]);
}
