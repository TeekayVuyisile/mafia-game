import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { auth, googleEnabled } from './auth.js';
import { getStats, getLeaderboard, getPlayerProfile, recordGameResults, xpForResult } from './stats.js';
import { serializeRoom, deserializeRoom, saveRoom, deleteSavedRoom, loadSavedRooms } from './roomStore.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 5000;

const MAX_CHAT_LENGTH = 300;
const CHAT_HISTORY_LIMIT = 200;
const CHAT_COOLDOWN_MS = 400;
// How long a room survives with every player disconnected (page refreshes, network blips)
const EMPTY_ROOM_GRACE_MS = 2 * 60 * 1000;
// How long a disconnected host keeps the role before it passes to a connected player
const HOST_HANDOFF_MS = 20 * 1000;
// Grace period after the last ballot is cast, so a final vote change can still land
const VOTE_CLOSE_DELAY_MS = 3000;
const SKIP_VOTE = 'skip';
// Persistence: how often changed rooms are written to Neon, how long restored players get to
// reconnect before the interrupted phase ends, and how old a save can be and still be restored
const PERSIST_INTERVAL_MS = 2000;
const RESUME_GRACE_MS = 20 * 1000;
const SAVED_ROOM_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Host-adjustable options; anything else sent by a client is ignored
const DISCUSSION_TIMES = [30, 60, 90, 120, 180];
const VOTING_TIMES = [15, 30, 45, 60];
const VOTE_VISIBILITY = ['anonymous', 'public'];
const DEFAULT_SETTINGS = {
  minPlayers: 4,
  maxPlayers: 10,
  discussionTime: 60,
  votingTime: 30,
  voteVisibility: 'anonymous',
  revealRoleOnDeath: false,
  detective: false
};
// The Detective finds the Mafia too quickly in small games, so it needs at least this many players
const DETECTIVE_MIN_PLAYERS = 6;
const CHAT_CHANNELS = ['town', 'mafia', 'ghost'];

app.use(cors());
// Better Auth parses its own request bodies, so it must be mounted before express.json()
app.all('/api/auth/{*any}', toNodeHandler(auth));
app.use(express.json());

// Lets the login screen hide providers that aren't configured
app.get('/api/config', (req, res) => res.json({ google: googleEnabled }));

app.get('/api/me/stats', async (req, res) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    res.json(await getStats(session.user.id));
  } catch (err) {
    console.error('Stats lookup failed:', err);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    res.json(await getLeaderboard(10));
  } catch (err) {
    console.error('Leaderboard lookup failed:', err);
    res.status(500).json({ error: 'Could not load leaderboard' });
  }
});

const rooms = {};

function clearRoomTimers(room) {
  if (room.phaseTimerId) {
    clearTimeout(room.phaseTimerId);
    room.phaseTimerId = null;
  }
}

function cancelRoomCleanup(room) {
  if (room.cleanupTimerId) {
    clearTimeout(room.cleanupTimerId);
    room.cleanupTimerId = null;
  }
}

function cancelHostHandoff(room) {
  if (room.hostTimerId) {
    clearTimeout(room.hostTimerId);
    room.hostTimerId = null;
  }
}

function destroyRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  cancelRoomCleanup(room);
  cancelHostHandoff(room);
  delete rooms[roomCode];
  savedSnapshots.delete(roomCode);
  deleteSavedRoom(roomCode).catch(err => console.error(`Failed to delete saved room ${roomCode}:`, err.message));
}

// Deletes a room that stays completely empty past the grace period
function scheduleEmptyRoomCleanup(roomCode, room) {
  cancelRoomCleanup(room);
  room.cleanupTimerId = setTimeout(() => {
    if (rooms[roomCode] === room && room.players.every(p => p.disconnected)) {
      console.log(`Room ${roomCode} cleaning up: all players gone.`);
      destroyRoom(roomCode);
    }
  }, EMPTY_ROOM_GRACE_MS);
}

function transferHost(roomCode, room, newHost) {
  cancelHostHandoff(room);
  room.players.forEach(p => { p.isHost = false; });
  newHost.isHost = true;
  room.host = newHost.userId;
  io.to(roomCode).emit('host_changed', { hostUserId: newHost.userId, message: `${newHost.username} is now the host.` });
  io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
}

// Connected players first, so control never lands on someone who is also offline
function pickNextHost(room) {
  const others = room.players.filter(p => p.userId !== room.host);
  return others.find(p => !p.disconnected) || others[0] || null;
}

const ROLE_ARTICLES = { Mafia: '', Medic: 'the ', Detective: 'the ', Civilian: 'a ' };

// Single place a player dies, so the optional role reveal applies to every kind of death
function eliminate(room, player) {
  player.isAlive = false;
  io.to(player.id).emit('chat_history', { channel: 'ghost', messages: room.ghostChat || [] });
  if (!room.settings.revealRoleOnDeath) return '';
  player.revealedRole = player.role;
  return ` They were ${ROLE_ARTICLES[player.role] ?? ''}${player.role}.`;
}

function updateLastActivity(roomCode) {
  if (rooms[roomCode]) {
    rooms[roomCode].lastActivity = Date.now();
  }
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms[code]);
  return code;
}

function getSanitizedPlayers(players) {
  return players.map(p => ({
    id: p.id,
    userId: p.userId,
    username: p.username,
    avatar: p.avatar ?? null,
    level: p.level ?? 1,
    isHost: !!p.isHost,
    isAlive: !!p.isAlive,
    disconnected: !!p.disconnected,
    // Only set when the host enabled "reveal role on death" and this player has died
    revealedRole: p.revealedRole ?? null
  }));
}

function tallyVotes(votes = {}) {
  return Object.values(votes).reduce((acc, uid) => {
    acc[uid] = (acc[uid] || 0) + 1;
    return acc;
  }, {});
}

// Tally is always public; who-voted-for-whom only when the host chose public votes
function getVoteState(room) {
  return {
    tally: tallyVotes(room.votes),
    votes: room.settings.voteVisibility === 'public' ? { ...room.votes } : null
  };
}

function getRemainingSeconds(room) {
  if (!room.phaseEndsAt) return null;
  return Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000));
}

function isAliveTarget(room, targetUserId) {
  return room.players.some(p => p.userId === targetUserId && p.isAlive);
}

// The pick this player has already locked in for the current phase, if any
function getPlayerTarget(room, player) {
  if (room.gameState === 'Voting') return room.votes?.[player.userId] ?? null;
  if (room.subPhase === 'MafiaTurn' && player.role === 'Mafia') return room.nightActions?.kill ?? null;
  if (room.subPhase === 'MedicTurn' && player.role === 'Medic') return room.nightActions?.save ?? null;
  if (room.subPhase === 'DetectiveTurn' && player.role === 'Detective') {
    return room.investigations?.find(i => i.night === room.night)?.userId ?? null;
  }
  return null;
}

// Fellow Mafia (userIds) for a Mafia player; empty for everyone else so roles never leak
function getMafiaTeammates(room, player) {
  if (player.role !== 'Mafia') return [];
  return room.players.filter(p => p.role === 'Mafia' && p.userId !== player.userId).map(p => p.userId);
}

// Everything a client needs to rebuild its view after a reload or dropped connection
function buildSyncPayload(roomCode, room, player) {
  return {
    roomCode,
    players: getSanitizedPlayers(room.players),
    gameState: room.gameState,
    subPhase: room.subPhase,
    role: player.role,
    teammates: getMafiaTeammates(room, player),
    message: room.currentMessage,
    timer: getRemainingSeconds(room),
    chat: room.chat,
    voteTally: room.gameState === 'Voting' ? tallyVotes(room.votes) : {},
    votes: room.gameState === 'Voting' ? getVoteState(room).votes : null,
    voteResult: room.gameState === 'NightResult' ? room.lastVoteResult : null,
    mafiaChat: player.role === 'Mafia' ? room.mafiaChat : [],
    ghostChat: player.role && !player.isAlive ? room.ghostChat : [],
    investigations: player.role === 'Detective' ? room.investigations : [],
    detectiveInPlay: room.detectiveInPlay,
    myTarget: getPlayerTarget(room, player),
    settings: room.settings,
    progress: room.gameState === 'GameOver' ? room.progress?.[player.userId] ?? null : null,
    result: room.gameState === 'GameOver' ? room.result : null
  };
}

function resetGameState(room) {
  clearRoomTimers(room);
  room.subPhase = null;
  room.phaseEndsAt = null;
  room.nightActions = { kill: null, save: null };
  room.votes = {};
  room.chat = [];
  room.mafiaChat = [];
  room.ghostChat = [];
  room.investigations = [];
  room.night = 0;
  room.detectiveInPlay = false;
  room.result = null;
  room.progress = {};
  room.votesClosing = false;
  room.lastVoteResult = null;
}

// Every socket must carry a valid session token; identity comes from it, never from event payloads
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    const session = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) });
    if (!session) return next(new Error('unauthorized'));
    socket.data.userId = session.user.id;
    next();
  } catch (err) {
    console.error('Socket auth failed:', err);
    next(new Error('unauthorized'));
  }
});

// Fresh name/avatar/level from the database, so profile edits show up in the next room
async function loadProfile(userId) {
  try {
    return await getPlayerProfile(userId);
  } catch (err) {
    console.error('Profile lookup failed:', err);
    return null;
  }
}

// ---------- Game flow ----------
// Module-level (not per-connection) so timers can be re-armed for rooms restored after a restart

function broadcastPhase(roomCode, gameState, message, timer, subPhase = null, extra = {}) {
  const room = rooms[roomCode];
  if (!room) return;
  room.gameState = gameState;
  room.subPhase = subPhase;
  room.currentMessage = message;
  room.phaseEndsAt = Date.now() + timer * 1000;
  room.lastActivity = Date.now();

  persistSoon();
  io.to(roomCode).emit('phase_change', {
    gameState,
    subPhase,
    message,
    timer,
    players: getSanitizedPlayers(room.players),
    ...extra
  });
}

function startNightPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  room.nightActions = { kill: null, save: null };
  room.night += 1;
  broadcastPhase(roomCode, 'Night', 'Night falls. Everyone close your eyes. Mafia, open your eyes and pick a target.', 15, 'MafiaTurn');
  room.phaseTimerId = setTimeout(() => startMedicTurn(roomCode), 15000);
}

function startMedicTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  broadcastPhase(roomCode, 'Night', 'Mafia, close your eyes. Medic, open your eyes and pick someone to save.', 15, 'MedicTurn');
  // The Detective's turn runs even after they die, so its absence never gives that away
  const next = room.detectiveInPlay ? startDetectiveTurn : startDiscussionPhase;
  room.phaseTimerId = setTimeout(() => next(roomCode), 15000);
}

function startDetectiveTurn(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  broadcastPhase(roomCode, 'Night', 'Medic, close your eyes. Detective, open your eyes and choose someone to investigate.', 15, 'DetectiveTurn');
  room.phaseTimerId = setTimeout(() => startDiscussionPhase(roomCode), 15000);
}

function startDiscussionPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);

  let death = 'A quiet night... no one died.';
  if (room.nightActions.kill && room.nightActions.kill !== room.nightActions.save) {
    const player = room.players.find(p => p.userId === room.nightActions.kill);
    if (player) death = `${player.username} was found dead this morning.${eliminate(room, player)}`;
  }

  const msg = `${room.detectiveInPlay ? 'Detective' : 'Medic'}, close your eyes. Everyone, open your eyes! ${death}`;
  // Check before broadcasting so the death announcement is narrated as part of game over
  // instead of being cut off by it
  if (checkWinConditions(roomCode, msg)) return;

  const seconds = room.settings.discussionTime;
  broadcastPhase(roomCode, 'Discussion', msg, seconds);
  room.phaseTimerId = setTimeout(() => startVotingPhase(roomCode), seconds * 1000);
}

function startVotingPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  room.votes = {};
  room.votesClosing = false;
  const seconds = room.settings.votingTime;
  broadcastPhase(roomCode, 'Voting', 'Time to vote! Who is the Mafia?', seconds);
  room.phaseTimerId = setTimeout(() => processVotes(roomCode), seconds * 1000);
}

// Once every connected living player has voted, close the ballot shortly instead of waiting out the timer
function maybeCloseVoting(roomCode, room) {
  if (room.gameState !== 'Voting' || room.votesClosing) return;
  const voters = room.players.filter(p => p.isAlive && !p.disconnected);
  if (voters.length === 0 || !voters.every(p => room.votes[p.userId])) return;
  room.votesClosing = true;
  clearRoomTimers(room);
  room.phaseEndsAt = Date.now() + VOTE_CLOSE_DELAY_MS;
  room.currentMessage = 'Everyone has voted. Closing the ballot...';
  io.to(roomCode).emit('phase_timer', { timer: VOTE_CLOSE_DELAY_MS / 1000, message: room.currentMessage });
  room.phaseTimerId = setTimeout(() => processVotes(roomCode), VOTE_CLOSE_DELAY_MS);
}

function processVotes(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);

  const voteState = getVoteState(room);
  const tally = voteState.tally;
  const maxVotes = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter(id => tally[id] === maxVotes);

  // A skip win or any tie (including a tie with skip) spares everyone
  let message;
  if (maxVotes === 0) message = 'No one voted. No one was eliminated.';
  else if (leaders.length > 1) message = 'The town was divided. No one was eliminated.';
  else if (leaders[0] === SKIP_VOTE) message = 'The town chose to skip. No one was eliminated.';
  else {
    const player = room.players.find(p => p.userId === leaders[0]);
    message = player
      ? `${player.username} was lynched by the town.${eliminate(room, player)}`
      : 'The accused has already fled. No one was eliminated.';
  }
  room.lastVoteResult = voteState;

  if (checkWinConditions(roomCode, message)) return;

  broadcastPhase(roomCode, 'NightResult', message, 5, null, { voteResult: voteState });
  room.phaseTimerId = setTimeout(() => startNightPhase(roomCode), 5000);
}

// lastEvent: the announcement that triggered the win (a death or lynching), so players still hear it
function checkWinConditions(roomCode, lastEvent = null) {
  const room = rooms[roomCode];
  const aliveMafia = room.players.filter(p => p.role === 'Mafia' && p.isAlive).length;
  const aliveOthers = room.players.filter(p => p.role !== 'Mafia' && p.isAlive).length;

  if (aliveMafia === 0) {
    endGame(roomCode, 'Civilians', 'All Mafia members have been eliminated!', lastEvent);
    return true;
  } else if (aliveMafia >= aliveOthers) {
    endGame(roomCode, 'Mafia', 'Mafia has outmatched the civilians!', lastEvent);
    return true;
  }
  return false;
}

function endGame(roomCode, winner, reason, lastEvent) {
  const room = rooms[roomCode];
  clearRoomTimers(room);
  room.gameState = 'GameOver';
  room.subPhase = null;
  room.phaseEndsAt = null;
  room.currentMessage = `${winner} Victory: ${reason}`;

  // On Game Over, we reveal ALL roles
  const revealedPlayers = getSanitizedPlayers(room.players).map((p, i) => ({ ...p, role: room.players[i].role }));
  room.result = { winner, reason, lastEvent, players: revealedPlayers };

  persistSoon();
  io.to(roomCode).emit('game_over', room.result);
  recordProgress(roomCode, room, winner);
}

async function recordProgress(roomCode, room, winner) {
  const results = room.players
    .filter(p => p.role)
    .map(p => ({
      userId: p.userId,
      role: p.role,
      won: winner === 'Mafia' ? p.role === 'Mafia' : p.role !== 'Mafia',
      survived: p.isAlive
    }));
  try {
    await recordGameResults(results);
    for (const result of results) {
      const player = room.players.find(p => p.userId === result.userId);
      if (!player) continue;
      const stats = await getStats(result.userId);
      player.level = stats.level;
      const progress = { xpGained: xpForResult(result), won: result.won, stats };
      // Kept on the room so a reload (or restart) on the game-over screen still shows it
      room.progress = { ...room.progress, [result.userId]: progress };
      io.to(player.id).emit('progress_update', progress);
    }
    if (rooms[roomCode] === room) io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
  } catch (err) {
    console.error('Failed to record game results:', err);
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  const userId = socket.data.userId;
  const isRoomHost = (room) => room?.host === userId;
  // Save after any player action (vote, chat, pick...). setImmediate lets the handler mutate the
  // room first; concurrent saves coalesce and unchanged rooms are skipped, so this stays cheap.
  socket.onAny(() => setImmediate(persistSoon));

  function restorePlayer(roomCode, room, player, profile) {
    if (profile) Object.assign(player, { username: profile.name, avatar: profile.image, level: profile.level });
    updateLastActivity(roomCode);
    cancelRoomCleanup(room);
    player.id = socket.id;
    player.disconnected = false;
    if (room.host === player.userId) cancelHostHandoff(room);
    socket.join(roomCode);
    socket.emit('room_reconnected', buildSyncPayload(roomCode, room, player));
    io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
  }

  socket.on('create_room', async () => {
    const profile = await loadProfile(userId);
    if (!profile) return socket.emit('error', 'Could not load your profile.');
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      host: userId,
      players: [{ id: socket.id, userId, username: profile.name, avatar: profile.image, level: profile.level, isHost: true, isAlive: true, disconnected: false }],
      settings: { ...DEFAULT_SETTINGS },
      kicked: new Set(),
      gameState: 'Lobby',
      phaseTimerId: null,
      cleanupTimerId: null,
      hostTimerId: null,
      currentMessage: 'Lobby',
      lastActivity: Date.now()
    };
    resetGameState(rooms[roomCode]);
    socket.join(roomCode);
    socket.emit('room_created', { roomCode, players: getSanitizedPlayers(rooms[roomCode].players), settings: rooms[roomCode].settings });
    console.log(`Room ${roomCode} created by ${profile.name}`);
  });

  socket.on('join_room', async ({ roomCode: rawCode } = {}) => {
    const roomCode = normalizeRoomCode(rawCode);
    if (!rooms[roomCode]) return socket.emit('error', 'Room not found');

    const profile = await loadProfile(userId);
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room not found');
    if (!profile) return socket.emit('error', 'Could not load your profile.');

    const existingPlayer = room.players.find(p => p.userId === userId);
    if (existingPlayer) return restorePlayer(roomCode, room, existingPlayer, profile);

    if (room.kicked.has(userId)) return socket.emit('error', 'You were removed from this room by the host.');
    if (room.gameState !== 'Lobby') return socket.emit('error', 'This game is already in progress.');
    if (room.players.length >= room.settings.maxPlayers) return socket.emit('error', 'This room is full.');

    updateLastActivity(roomCode);
    const player = { id: socket.id, userId, username: profile.name, avatar: profile.image, level: profile.level, isHost: false, isAlive: true, disconnected: false };
    room.players.push(player);
    socket.join(roomCode);

    io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
    socket.emit('room_joined', { roomCode, players: getSanitizedPlayers(room.players), settings: room.settings });
  });

  socket.on('reconnect_user', ({ roomCode: rawCode } = {}) => {
    const roomCode = normalizeRoomCode(rawCode);
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room no longer exists.');

    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('error', 'Player not found in this room.');

    console.log(`RECONNECT SUCCESS: ${player.username} returned.`);
    restorePlayer(roomCode, room, player);
  });

  socket.on('update_settings', ({ roomCode, settings } = {}) => {
    const room = rooms[roomCode];
    if (!room || !isRoomHost(room) || room.gameState !== 'Lobby' || !settings || typeof settings !== 'object') return;
    const next = { ...room.settings };
    if (DISCUSSION_TIMES.includes(settings.discussionTime)) next.discussionTime = settings.discussionTime;
    if (VOTING_TIMES.includes(settings.votingTime)) next.votingTime = settings.votingTime;
    if (VOTE_VISIBILITY.includes(settings.voteVisibility)) next.voteVisibility = settings.voteVisibility;
    if (typeof settings.revealRoleOnDeath === 'boolean') next.revealRoleOnDeath = settings.revealRoleOnDeath;
    if (typeof settings.detective === 'boolean') next.detective = settings.detective;
    room.settings = next;
    updateLastActivity(roomCode);
    io.to(roomCode).emit('settings_updated', { settings: next });
  });

  socket.on('kick_player', ({ roomCode, targetUserId } = {}) => {
    const room = rooms[roomCode];
    if (!room || !isRoomHost(room) || room.gameState !== 'Lobby' || targetUserId === userId) return;
    const target = room.players.find(p => p.userId === targetUserId);
    if (!target) return;
    room.players = room.players.filter(p => p !== target);
    room.kicked.add(targetUserId);
    io.to(target.id).emit('kicked', { message: 'The host removed you from the room.' });
    io.in(target.id).socketsLeave(roomCode);
    io.to(roomCode).emit('player_left', { players: getSanitizedPlayers(room.players) });
  });

  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.gameState === 'Lobby' && isRoomHost(room) && room.players.length >= room.settings.minPlayers) {
      updateLastActivity(roomCode);
      resetGameState(room);
      room.gameState = 'RoleAssignment';
      room.currentMessage = 'Roles are being assigned... Check your secret identity.';
      room.phaseEndsAt = Date.now() + 10000;

      const shuffledPlayers = [...room.players];
      for (let i = shuffledPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
      }

      const playerCount = shuffledPlayers.length;
      let mafiaCount = playerCount >= 7 ? 2 : 1;
      let medicCount = 1;
      // Dropped automatically if players left and the room fell below the minimum
      room.detectiveInPlay = room.settings.detective && playerCount >= DETECTIVE_MIN_PLAYERS;
      const detectiveCount = room.detectiveInPlay ? 1 : 0;

      shuffledPlayers.forEach((player, index) => {
        if (index < mafiaCount) player.role = 'Mafia';
        else if (index < (mafiaCount + medicCount)) player.role = 'Medic';
        else if (index < (mafiaCount + medicCount + detectiveCount)) player.role = 'Detective';
        else player.role = 'Civilian';
        player.isAlive = true;
      });

      room.players = shuffledPlayers;

      room.players.forEach(player => {
        io.to(player.id).emit('game_started', {
          gameState: 'RoleAssignment',
          role: player.role,
          teammates: getMafiaTeammates(room, player),
          message: room.currentMessage,
          timer: 10,
          settings: room.settings,
          detectiveInPlay: room.detectiveInPlay,
          players: getSanitizedPlayers(room.players)
        });
      });

      room.phaseTimerId = setTimeout(() => startNightPhase(roomCode), 10000);
    }
  });

  socket.on('submit_mafia_action', ({ roomCode, targetUserId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    const target = room?.players.find(p => p.userId === targetUserId);
    if (room && player?.role === 'Mafia' && player.isAlive && room.subPhase === 'MafiaTurn'
        && target?.isAlive && target.role !== 'Mafia') {
      updateLastActivity(roomCode);
      room.nightActions.kill = targetUserId;
      socket.emit('action_confirmed', { message: 'Mafia choice recorded. Close your eyes.' });
      // The team shares one kill: show the latest pick to the other Mafia so they can coordinate
      for (const mate of room.players) {
        if (mate.role === 'Mafia' && mate.userId !== player.userId && !mate.disconnected) {
          io.to(mate.id).emit('mafia_target', {
            targetUserId,
            message: `${player.username} marked ${target.username}. Pick someone else to change the target.`
          });
        }
      }
    }
  });

  socket.on('submit_medic_action', ({ roomCode, targetUserId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (room && player?.role === 'Medic' && player.isAlive && room.subPhase === 'MedicTurn' && isAliveTarget(room, targetUserId)) {
      updateLastActivity(roomCode);
      room.nightActions.save = targetUserId;
      socket.emit('action_confirmed', { message: 'Medic choice recorded. Close your eyes.' });
    }
  });

  socket.on('submit_detective_action', ({ roomCode, targetUserId } = {}) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    const target = room?.players.find(p => p.userId === targetUserId);
    if (!room || player?.role !== 'Detective' || !player.isAlive || room.subPhase !== 'DetectiveTurn'
        || !target?.isAlive || target.userId === player.userId) return;
    // One investigation per night, and the answer is final
    if (room.investigations.some(i => i.night === room.night)) return;
    updateLastActivity(roomCode);
    const finding = { night: room.night, userId: target.userId, username: target.username, isMafia: target.role === 'Mafia' };
    room.investigations.push(finding);
    socket.emit('investigation_result', finding);
    socket.emit('action_confirmed', {
      message: `${target.username} is ${finding.isMafia ? 'MAFIA' : 'not Mafia'}. Keep it to yourself, or use it wisely. Close your eyes.`
    });
  });

  socket.on('submit_vote', ({ roomCode, targetUserId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    const validTarget = targetUserId === SKIP_VOTE || (targetUserId !== player?.userId && isAliveTarget(room, targetUserId));
    if (room && room.gameState === 'Voting' && player?.isAlive && validTarget) {
      updateLastActivity(roomCode);
      room.votes[player.userId] = targetUserId;
      io.to(roomCode).emit('vote_update', getVoteState(room));
      maybeCloseVoting(roomCode, room);
    }
  });

  socket.on('send_message', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { roomCode, message } = payload || {};
    const channel = CHAT_CHANNELS.includes(payload?.channel) ? payload.channel : 'town';
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    const inGame = room && !['Lobby', 'GameOver'].includes(room.gameState);

    if (!room || !player) return reply({ ok: false, error: 'You are not connected to this room.' });
    if (channel === 'town') {
      if (room.gameState !== 'Discussion') return reply({ ok: false, error: 'Chat is only open during discussion.' });
      if (!player.isAlive) return reply({ ok: false, error: 'The dead cannot speak. Use the graveyard chat.' });
    } else if (channel === 'mafia') {
      if (player.role !== 'Mafia' || !player.isAlive) return reply({ ok: false, error: 'Only living Mafia can use this line.' });
      if (room.gameState !== 'Night') return reply({ ok: false, error: 'The Mafia line only opens at night.' });
    } else if (channel === 'ghost') {
      if (!inGame || !player.role || player.isAlive) return reply({ ok: false, error: 'Only the dead can talk in the graveyard.' });
    }

    const text = typeof message === 'string' ? message.trim().slice(0, MAX_CHAT_LENGTH) : '';
    if (!text) return reply({ ok: false, error: 'Message is empty.' });

    const now = Date.now();
    if (player.lastMessageAt && now - player.lastMessageAt < CHAT_COOLDOWN_MS) {
      return reply({ ok: false, error: 'Slow down, you are sending too fast.' });
    }
    player.lastMessageAt = now;
    updateLastActivity(roomCode);

    room.chatSeq = (room.chatSeq || 0) + 1;
    const chatMessage = {
      id: `${roomCode}-${room.chatSeq}`,
      channel,
      userId: player.userId,
      username: player.username,
      message: text,
      timestamp: now
    };
    const history = channel === 'mafia' ? room.mafiaChat : channel === 'ghost' ? room.ghostChat : room.chat;
    history.push(chatMessage);
    if (history.length > CHAT_HISTORY_LIMIT) history.shift();

    if (channel === 'town') {
      io.to(roomCode).emit('receive_message', chatMessage);
    } else {
      // Private channels go only to their members (all Mafia / all dead players)
      const members = room.players.filter(p => (channel === 'mafia' ? p.role === 'Mafia' : p.role && !p.isAlive));
      for (const member of members) io.to(member.id).emit('receive_message', chatMessage);
    }
    reply({ ok: true, id: chatMessage.id });
  });

  socket.on('restart_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && isRoomHost(room)) {
      resetGameState(room);
      room.gameState = 'Lobby';
      room.currentMessage = 'Lobby';
      room.players.forEach(p => { delete p.role; delete p.revealedRole; p.isAlive = true; });
      io.to(roomCode).emit('room_restarted', { players: getSanitizedPlayers(room.players), settings: room.settings });
    }
  });

  socket.on('leave_room_explicitly', ({ roomCode } = {}) => {
      const room = rooms[roomCode];
      if (!room) return;
      const leaver = room.players.find(p => p.userId === userId);
      if (!leaver) return;

      room.players = room.players.filter(p => p.userId !== userId);
      socket.leave(roomCode);
      if (room.votes) delete room.votes[userId];

      if (room.players.length === 0) {
          destroyRoom(roomCode);
          return;
      }

      io.to(roomCode).emit('player_left', { players: getSanitizedPlayers(room.players) });
      if (userId === room.host) transferHost(roomCode, room, pickNextHost(room));
      maybeCloseVoting(roomCode, room);

      // A player quitting mid-game can decide it (e.g. the last Mafia walks out)
      const inProgress = !['Lobby', 'GameOver'].includes(room.gameState);
      if (inProgress && leaver.isAlive) {
          checkWinConditions(roomCode, `${leaver.username} has fled the city.`);
      }
  });

  socket.on('end_game_permanently', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && isRoomHost(room)) {
      io.to(roomCode).emit('room_terminated', { message: 'The host has ended the game session.' });
      destroyRoom(roomCode);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const player = room.players.find(p => p.id === socket.id);

      if (player) {
        // Mark as disconnected but DON'T remove yet.
        // We only remove if they explicitly leave or the room stays empty past the grace period.
        player.disconnected = true;
        io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });

        // Give a dropped host a moment to come back before someone else takes over
        if (player.userId === room.host && room.players.some(p => !p.disconnected)) {
          cancelHostHandoff(room);
          room.hostTimerId = setTimeout(() => {
            room.hostTimerId = null;
            if (rooms[roomCode] !== room || !player.disconnected || room.host !== player.userId) return;
            const next = pickNextHost(room);
            if (next && !next.disconnected) transferHost(roomCode, room, next);
          }, HOST_HANDOFF_MS);
        }
        // A voter dropping out shouldn't hold the ballot open
        maybeCloseVoting(roomCode, room);

        if (room.players.every(p => p.disconnected)) scheduleEmptyRoomCleanup(roomCode, room);
        break;
      }
    }
  });
});

app.get('/', (req, res) => res.send('Mafia Game Backend is running'));

// ---------- Persistence ----------
const savedSnapshots = new Map(); // roomCode -> last JSON written, so unchanged rooms are skipped
let persisting = false;
let persistQueued = false;

async function persistRooms() {
  // A save requested mid-save runs again right after, so a phase change is never skipped
  if (persisting) {
    persistQueued = true;
    return;
  }
  persisting = true;
  persistQueued = false;
  try {
    for (const [code, room] of Object.entries(rooms)) {
      const json = serializeRoom(room);
      if (savedSnapshots.get(code) === json) continue;
      try {
        await saveRoom(code, json);
        if (rooms[code] === room) savedSnapshots.set(code, json);
      } catch (err) {
        console.error(`Failed to save room ${code}:`, err.message);
      }
    }
  } finally {
    persisting = false;
  }
  if (persistQueued) await persistRooms();
}

// Phase changes and game over are the moments worth saving straight away, not on the next tick
function persistSoon() {
  persistRooms().catch(err => console.error('Room save failed:', err.message));
}

// Which step an interrupted phase was heading to when the server went down
function nextStepFor(room) {
  switch (room.gameState) {
    case 'RoleAssignment': return startNightPhase;
    case 'Night':
      if (room.subPhase === 'MafiaTurn') return startMedicTurn;
      if (room.subPhase === 'MedicTurn') return room.detectiveInPlay ? startDetectiveTurn : startDiscussionPhase;
      return startDiscussionPhase;
    case 'Discussion': return startVotingPhase;
    case 'Voting': return processVotes;
    case 'NightResult': return startNightPhase;
    default: return null;
  }
}

async function restoreRooms() {
  const saved = await loadSavedRooms(SAVED_ROOM_MAX_AGE_MS);
  let restored = 0;
  for (const { code, state } of saved) {
    const room = deserializeRoom(state);
    if (!room) continue;
    // Every socket died with the old process; players reattach through reconnect_user
    room.players.forEach(p => { p.disconnected = true; p.id = null; });
    room.lastActivity = Date.now();
    rooms[code] = room;

    const next = nextStepFor(room);
    if (next) {
      const remaining = Math.max((room.phaseEndsAt || 0) - Date.now(), RESUME_GRACE_MS);
      room.phaseEndsAt = Date.now() + remaining;
      room.phaseTimerId = setTimeout(() => next(code), remaining);
    }
    scheduleEmptyRoomCleanup(code, room);
    restored++;
  }
  if (restored) console.log(`Restored ${restored} room(s) from the database`);
}

try {
  await restoreRooms();
} catch (err) {
  // Start anyway: a missing table (migration not run) shouldn't take the whole game down
  console.error('Could not restore saved rooms:', err.message);
}
const persistInterval = setInterval(persistRooms, PERSIST_INTERVAL_MS);

// Render sends SIGTERM before replacing the instance on deploy: save everything first
async function shutdown(signal) {
  console.log(`${signal} received, saving rooms before exit`);
  clearInterval(persistInterval);
  await persistRooms();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Cleanup interval: Check for inactive rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  for (const roomCode in rooms) {
    if (now - rooms[roomCode].lastActivity > INACTIVE_THRESHOLD) {
      console.log(`Cleaning up inactive room: ${roomCode}`);
      destroyRoom(roomCode);
    }
  }
}, 10 * 60 * 1000);

httpServer.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
