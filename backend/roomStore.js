// Persists in-memory rooms to Neon so a restart or deploy doesn't wipe games in progress.
import os from 'os';
import { pool } from './auth.js';

// Local dev and Render share one Neon database, so every server only restores its own rooms.
// Render sets RENDER_SERVICE_ID; locally the host + port keeps parallel dev/test servers apart.
const OWNER = process.env.RENDER_SERVICE_ID || `local:${os.hostname()}:${process.env.PORT || 5000}`;

export const ROOMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS game_rooms (
    owner TEXT NOT NULL,
    code TEXT NOT NULL,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, code)
  );
`;

// Bump when the saved shape changes incompatibly; older saves are then ignored on restore
const STATE_VERSION = 1;
// Live handles that only make sense inside the running process
const TRANSIENT_KEYS = new Set(['phaseTimerId', 'cleanupTimerId', 'hostTimerId']);

export function serializeRoom(room) {
  const state = {};
  for (const [key, value] of Object.entries(room)) {
    if (!TRANSIENT_KEYS.has(key)) state[key] = value;
  }
  state.kicked = [...(room.kicked || [])];
  // eslint-disable-next-line no-unused-vars
  state.players = room.players.map(({ lastMessageAt, ...player }) => player);
  return JSON.stringify({ v: STATE_VERSION, ...state });
}

export function deserializeRoom(saved) {
  if (!saved || saved.v !== STATE_VERSION) return null;
  // eslint-disable-next-line no-unused-vars
  const { v, ...state } = saved;
  return {
    ...state,
    kicked: new Set(state.kicked || []),
    phaseTimerId: null,
    cleanupTimerId: null,
    hostTimerId: null
  };
}

export async function saveRoom(code, serialized) {
  await pool.query(
    `INSERT INTO game_rooms (owner, code, state, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (owner, code) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [OWNER, code, serialized]
  );
}

export async function deleteSavedRoom(code) {
  await pool.query('DELETE FROM game_rooms WHERE owner = $1 AND code = $2', [OWNER, code]);
}

// Rooms untouched for longer than maxAgeMs are abandoned; drop them instead of restoring
export async function loadSavedRooms(maxAgeMs) {
  await pool.query(
    `DELETE FROM game_rooms WHERE owner = $1 AND updated_at < now() - ($2 || ' milliseconds')::interval`,
    [OWNER, String(maxAgeMs)]
  );
  const { rows } = await pool.query('SELECT code, state FROM game_rooms WHERE owner = $1', [OWNER]);
  return rows;
}
