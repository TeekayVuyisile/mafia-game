import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { toNodeHandler } from 'better-auth/node';
import { auth, googleEnabled } from './auth.js';

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

app.use(cors());
// Better Auth parses its own request bodies, so it must be mounted before express.json()
app.all('/api/auth/{*any}', toNodeHandler(auth));
app.use(express.json());

// Lets the login screen hide providers that aren't configured
app.get('/api/config', (req, res) => res.json({ google: googleEnabled }));

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

function destroyRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  clearRoomTimers(room);
  cancelRoomCleanup(room);
  delete rooms[roomCode];
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
    isHost: !!p.isHost,
    isAlive: !!p.isAlive,
    disconnected: !!p.disconnected
  }));
}

function tallyVotes(votes = {}) {
  return Object.values(votes).reduce((acc, uid) => {
    acc[uid] = (acc[uid] || 0) + 1;
    return acc;
  }, {});
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
  return null;
}

// Everything a client needs to rebuild its view after a reload or dropped connection
function buildSyncPayload(roomCode, room, player) {
  return {
    roomCode,
    players: getSanitizedPlayers(room.players),
    gameState: room.gameState,
    subPhase: room.subPhase,
    role: player.role,
    message: room.currentMessage,
    timer: getRemainingSeconds(room),
    chat: room.chat,
    voteTally: room.gameState === 'Voting' ? tallyVotes(room.votes) : {},
    myTarget: getPlayerTarget(room, player),
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
  room.result = null;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  function restorePlayer(roomCode, room, player) {
    updateLastActivity(roomCode);
    cancelRoomCleanup(room);
    player.id = socket.id;
    player.disconnected = false;
    socket.join(roomCode);
    socket.emit('room_reconnected', buildSyncPayload(roomCode, room, player));
    io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
  }

  socket.on('create_room', ({ username, userId }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      host: userId,
      players: [{ id: socket.id, userId, username, isHost: true, isAlive: true, disconnected: false }],
      settings: { minPlayers: 4, maxPlayers: 10 },
      gameState: 'Lobby',
      phaseTimerId: null,
      cleanupTimerId: null,
      currentMessage: 'Lobby',
      lastActivity: Date.now()
    };
    resetGameState(rooms[roomCode]);
    socket.join(roomCode);
    socket.emit('room_created', { roomCode, players: getSanitizedPlayers(rooms[roomCode].players) });
    console.log(`Room ${roomCode} created by ${username}`);
  });

  socket.on('join_room', ({ roomCode: rawCode, username, userId }) => {
    const roomCode = normalizeRoomCode(rawCode);
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room not found');

    const existingPlayer = room.players.find(p => p.userId === userId);
    if (existingPlayer) return restorePlayer(roomCode, room, existingPlayer);

    if (room.gameState !== 'Lobby') return socket.emit('error', 'This game is already in progress.');
    if (room.players.length >= room.settings.maxPlayers) return socket.emit('error', 'This room is full.');

    updateLastActivity(roomCode);
    const player = { id: socket.id, userId, username, isHost: false, isAlive: true, disconnected: false };
    room.players.push(player);
    socket.join(roomCode);

    io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
    socket.emit('room_joined', { roomCode, players: getSanitizedPlayers(room.players), settings: room.settings });
  });

  socket.on('reconnect_user', ({ roomCode: rawCode, userId }) => {
    const roomCode = normalizeRoomCode(rawCode);
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Room no longer exists.');

    const player = room.players.find(p => p.userId === userId);
    if (!player) return socket.emit('error', 'Player not found in this room.');

    console.log(`RECONNECT SUCCESS: ${player.username} returned.`);
    restorePlayer(roomCode, room, player);
  });

  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.gameState === 'Lobby' && socket.id === room.players.find(p => p.userId === room.host)?.id && room.players.length >= room.settings.minPlayers) {
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

      shuffledPlayers.forEach((player, index) => {
        if (index < mafiaCount) player.role = 'Mafia';
        else if (index < (mafiaCount + medicCount)) player.role = 'Medic';
        else player.role = 'Civilian';
        player.isAlive = true;
      });

      room.players = shuffledPlayers;

      room.players.forEach(player => {
        io.to(player.id).emit('game_started', {
          gameState: 'RoleAssignment',
          role: player.role,
          message: room.currentMessage,
          timer: 10,
          players: getSanitizedPlayers(room.players)
        });
      });

      room.phaseTimerId = setTimeout(() => startNightPhase(roomCode), 10000);
    }
  });

  function broadcastPhase(roomCode, gameState, message, timer, subPhase = null) {
    const room = rooms[roomCode];
    if (!room) return;
    room.gameState = gameState;
    room.subPhase = subPhase;
    room.currentMessage = message;
    room.phaseEndsAt = Date.now() + timer * 1000;
    room.lastActivity = Date.now();

    io.to(roomCode).emit('phase_change', {
      gameState,
      subPhase,
      message,
      timer,
      players: getSanitizedPlayers(room.players)
    });
  }

  function startNightPhase(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    clearRoomTimers(room);
    room.nightActions = { kill: null, save: null };
    broadcastPhase(roomCode, 'Night', 'Night falls. Everyone close your eyes. Mafia, open your eyes and pick a target.', 15, 'MafiaTurn');
    room.phaseTimerId = setTimeout(() => startMedicTurn(roomCode), 15000);
  }

  function startMedicTurn(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    clearRoomTimers(room);
    broadcastPhase(roomCode, 'Night', 'Mafia, close your eyes. Medic, open your eyes and pick someone to save.', 15, 'MedicTurn');
    room.phaseTimerId = setTimeout(() => startDiscussionPhase(roomCode), 15000);
  }

  function startDiscussionPhase(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    clearRoomTimers(room);

    let eliminatedPlayer = null;
    if (room.nightActions.kill && room.nightActions.kill !== room.nightActions.save) {
      const player = room.players.find(p => p.userId === room.nightActions.kill);
      if (player) {
        player.isAlive = false;
        eliminatedPlayer = player.username;
      }
    }

    const msg = 'Medic, close your eyes. Everyone, open your eyes! ' + (eliminatedPlayer ? `${eliminatedPlayer} was found dead this morning.` : 'A quiet night... no one died.');
    // Check before broadcasting so the death announcement is narrated as part of game over
    // instead of being cut off by it
    if (checkWinConditions(roomCode, msg)) return;

    broadcastPhase(roomCode, 'Discussion', msg, 60);
    room.phaseTimerId = setTimeout(() => startVotingPhase(roomCode), 60000);
  }

  function startVotingPhase(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    clearRoomTimers(room);
    room.votes = {};
    broadcastPhase(roomCode, 'Voting', 'Time to vote! Who is the Mafia?', 30);
    room.phaseTimerId = setTimeout(() => processVotes(roomCode), 30000);
  }

  socket.on('submit_mafia_action', ({ roomCode, targetUserId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (room && player?.role === 'Mafia' && player.isAlive && room.subPhase === 'MafiaTurn'
        && targetUserId !== player.userId && isAliveTarget(room, targetUserId)) {
      updateLastActivity(roomCode);
      room.nightActions.kill = targetUserId;
      socket.emit('action_confirmed', { message: 'Mafia choice recorded. Close your eyes.' });
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

  socket.on('submit_vote', ({ roomCode, targetUserId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (room && room.gameState === 'Voting' && player?.isAlive
        && targetUserId !== player.userId && isAliveTarget(room, targetUserId)) {
      updateLastActivity(roomCode);
      room.votes[player.userId] = targetUserId;
      io.to(roomCode).emit('vote_update', { tally: tallyVotes(room.votes) });
    }
  });

  socket.on('send_message', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { roomCode, message } = payload || {};
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);

    if (!room || !player) return reply({ ok: false, error: 'You are not connected to this room.' });
    if (room.gameState !== 'Discussion') return reply({ ok: false, error: 'Chat is only open during discussion.' });
    if (!player.isAlive) return reply({ ok: false, error: 'The dead cannot speak.' });

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
      userId: player.userId,
      username: player.username,
      message: text,
      timestamp: now
    };
    room.chat.push(chatMessage);
    if (room.chat.length > CHAT_HISTORY_LIMIT) room.chat.shift();

    io.to(roomCode).emit('receive_message', chatMessage);
    reply({ ok: true, id: chatMessage.id });
  });

  function processVotes(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    clearRoomTimers(room);

    const tally = tallyVotes(room.votes);

    let eliminatedUserId = null;
    let maxVotes = 0;
    for (const [userId, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedUserId = userId;
      } else if (count === maxVotes) {
        eliminatedUserId = null;
      }
    }

    let message = 'The town was divided. No one was eliminated.';
    if (eliminatedUserId) {
      const player = room.players.find(p => p.userId === eliminatedUserId);
      if (player) {
        player.isAlive = false;
        message = `${player.username} was lynched by the town.`;
      }
    }

    if (checkWinConditions(roomCode, message)) return;

    broadcastPhase(roomCode, 'NightResult', message, 5);
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

    io.to(roomCode).emit('game_over', room.result);
  }

  socket.on('restart_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && socket.id === room.players.find(p => p.userId === room.host)?.id) {
      resetGameState(room);
      room.gameState = 'Lobby';
      room.currentMessage = 'Lobby';
      room.players.forEach(p => { delete p.role; p.isAlive = true; });
      io.to(roomCode).emit('room_restarted', { players: getSanitizedPlayers(room.players) });
    }
  });

  socket.on('leave_room_explicitly', ({ roomCode, userId }) => {
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

      if (userId === room.host) {
          room.host = room.players[0].userId;
          room.players[0].isHost = true;
      }
      io.to(roomCode).emit('player_left', { players: getSanitizedPlayers(room.players) });

      // A player quitting mid-game can decide it (e.g. the last Mafia walks out)
      const inProgress = !['Lobby', 'GameOver'].includes(room.gameState);
      if (inProgress && leaver.isAlive) {
          checkWinConditions(roomCode, `${leaver.username} has fled the city.`);
      }
  });

  socket.on('end_game_permanently', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && socket.id === room.players.find(p => p.userId === room.host)?.id) {
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

        if (room.players.every(p => p.disconnected)) {
            cancelRoomCleanup(room);
            room.cleanupTimerId = setTimeout(() => {
              if (rooms[roomCode] === room && room.players.every(p => p.disconnected)) {
                console.log(`Room ${roomCode} cleaning up: all players gone.`);
                destroyRoom(roomCode);
              }
            }, EMPTY_ROOM_GRACE_MS);
        }
        break;
      }
    }
  });
});

app.get('/', (req, res) => res.send('Mafia Game Backend is running'));

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
