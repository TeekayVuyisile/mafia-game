import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { supabase } from './supabaseClient.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', 
  }
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const rooms = {};

function clearRoomTimers(room) {
  if (room.phaseTimerId) {
    clearTimeout(room.phaseTimerId);
    room.phaseTimerId = null;
  }
}

function updateLastActivity(roomCode) {
  if (rooms[roomCode]) {
    rooms[roomCode].lastActivity = Date.now();
  }
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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ username, userId }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomCode] = {
      host: userId, 
      players: [{ id: socket.id, userId, username, isHost: true, isAlive: true, disconnected: false }],
      settings: { minPlayers: 4, maxPlayers: 10 },
      gameState: 'Lobby',
      phaseTimerId: null,
      currentMessage: 'Lobby',
      lastActivity: Date.now()
    };
    socket.join(roomCode);
    socket.emit('room_created', { roomCode, players: getSanitizedPlayers(rooms[roomCode].players) });
    console.log(`Room ${roomCode} created by ${username}`);
  });

  socket.on('join_room', ({ roomCode, username, userId }) => {
    const room = rooms[roomCode];
    if (room) {
      updateLastActivity(roomCode);
      const existingPlayer = room.players.find(p => p.userId === userId);
      if (existingPlayer) {
          existingPlayer.id = socket.id;
          existingPlayer.disconnected = false;
          socket.join(roomCode);
          socket.emit('room_reconnected', { 
              roomCode, 
              players: getSanitizedPlayers(room.players), 
              gameState: room.gameState, 
              subPhase: room.subPhase,
              role: existingPlayer.role,
              message: room.currentMessage
          });
          io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
          return;
      }

      const player = { id: socket.id, userId, username, isHost: false, isAlive: true, disconnected: false };
      room.players.push(player);
      socket.join(roomCode);
      
      io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
      socket.emit('room_joined', { roomCode, players: getSanitizedPlayers(room.players), settings: room.settings });
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('reconnect_user', ({ roomCode, userId }) => {
    const room = rooms[roomCode];
    if (room) {
      updateLastActivity(roomCode);
      const player = room.players.find(p => p.userId === userId);
      if (player) {
        console.log(`RECONNECT SUCCESS: ${player.username} returned.`);
        player.id = socket.id; 
        player.disconnected = false;
        socket.join(roomCode);
        
        socket.emit('room_reconnected', {
          roomCode,
          players: getSanitizedPlayers(room.players),
          gameState: room.gameState,
          subPhase: room.subPhase,
          role: player.role,
          message: room.currentMessage
        });

        io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
      } else {
        socket.emit('error', 'Player not found in this room.');
      }
    } else {
      socket.emit('error', 'Room no longer exists.');
    }
  });

  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && socket.id === room.players.find(p => p.userId === room.host)?.id && room.players.length >= 4) {
      updateLastActivity(roomCode);
      clearRoomTimers(room);
      room.gameState = 'RoleAssignment';
      room.currentMessage = 'Roles are being assigned... Check your secret identity.';
      
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
    broadcastPhase(roomCode, 'Discussion', msg, 60);

    if (checkWinConditions(roomCode)) return;
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
    if (room && player?.role === 'Mafia' && room.subPhase === 'MafiaTurn') {
      updateLastActivity(roomCode);
      room.nightActions.kill = targetUserId;
      socket.emit('action_confirmed', { message: 'Mafia choice recorded. Close your eyes.' });
    }
  });

  socket.on('submit_medic_action', ({ roomCode, targetUserId }) => {
    const roomCode_val = roomCode; // Avoid shadowing if any
    const room = rooms[roomCode_val];
    const player = room?.players.find(p => p.id === socket.id);
    if (room && player?.role === 'Medic' && room.subPhase === 'MedicTurn') {
      updateLastActivity(roomCode_val);
      room.nightActions.save = targetUserId;
      socket.emit('action_confirmed', { message: 'Medic choice recorded. Close your eyes.' });
    }
  });

  socket.on('submit_vote', ({ roomCode, targetUserId }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (room && room.gameState === 'Voting' && player?.isAlive) {
      updateLastActivity(roomCode);
      room.votes[player.userId] = targetUserId; 
      const tally = Object.values(room.votes).reduce((acc, uid) => {
        acc[uid] = (acc[uid] || 0) + 1;
        return acc;
      }, {});
      io.to(roomCode).emit('vote_update', { tally });
    }
  });

  socket.on('send_message', ({ roomCode, message }) => {
    const room = rooms[roomCode];
    const player = room?.players.find(p => p.id === socket.id);
    if (room && room.gameState === 'Discussion' && player?.isAlive) {
      updateLastActivity(roomCode);
      io.to(roomCode).emit('receive_message', { 
        username: player.username, 
        message,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  });

  function processVotes(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    clearRoomTimers(room);

    const tally = Object.values(room.votes).reduce((acc, targetUserId) => {
      acc[targetUserId] = (acc[targetUserId] || 0) + 1;
      return acc;
    }, {});

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

    if (checkWinConditions(roomCode)) return;

    broadcastPhase(roomCode, 'NightResult', message, 5);
    room.phaseTimerId = setTimeout(() => startNightPhase(roomCode), 5000);
  }
  function checkWinConditions(roomCode) {
    const room = rooms[roomCode];
    const aliveMafia = room.players.filter(p => p.role === 'Mafia' && p.isAlive).length;
    const aliveOthers = room.players.filter(p => p.role !== 'Mafia' && p.isAlive).length;

    if (aliveMafia === 0) {
      endGame(roomCode, 'Civilians', 'All Mafia members have been eliminated!');
      return true;
    } else if (aliveMafia >= aliveOthers) {
      endGame(roomCode, 'Mafia', 'Mafia has outmatched the civilians!');
      return true;
    }
    return false;
  }

  function endGame(roomCode, winner, reason) {
    const room = rooms[roomCode];
    clearRoomTimers(room);
    room.gameState = 'GameOver';
    room.currentMessage = `${winner} Victory: ${reason}`;
    
    // On Game Over, we reveal ALL roles
    const revealedPlayers = room.players.map(p => ({
      ...p,
      isHost: !!p.isHost,
      isAlive: !!p.isAlive,
      disconnected: !!p.disconnected
    }));

    io.to(roomCode).emit('game_over', { winner, reason, players: revealedPlayers });
  }

  socket.on('restart_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && socket.id === room.players.find(p => p.userId === room.host)?.id) {
      clearRoomTimers(room);
      room.gameState = 'Lobby';
      room.subPhase = null;
      room.currentMessage = 'Lobby';
      room.players.forEach(p => { delete p.role; p.isAlive = true; });
      io.to(roomCode).emit('room_restarted', { players: getSanitizedPlayers(room.players) });
    }
  });

  socket.on('leave_room_explicitly', ({ roomCode, userId }) => {
      const room = rooms[roomCode];
      if (room) {
          room.players = room.players.filter(p => p.userId !== userId);
          if (room.players.length === 0) {
              clearRoomTimers(room);
              delete rooms[roomCode];
          } else {
              if (userId === room.host) {
                  room.host = room.players[0].userId;
                  room.players[0].isHost = true;
              }
              io.to(roomCode).emit('player_left', { players: getSanitizedPlayers(room.players) });
          }
      }
  });

  socket.on('end_game_permanently', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && socket.id === room.players.find(p => p.userId === room.host)?.id) {
      clearRoomTimers(room);
      io.to(roomCode).emit('room_terminated', { message: 'The host has ended the game session.' });
      delete rooms[roomCode];
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const player = room.players.find(p => p.id === socket.id);
      
      if (player) {
        // Mark as disconnected but DON'T remove yet. 
        // We only remove if they explicitly leave or the room becomes empty.
        player.disconnected = true;
        
        // Check if everyone is gone
        const allDisconnected = room.players.every(p => p.disconnected);
        if (allDisconnected) {
            console.log(`Room ${roomCode} cleaning up: all players gone.`);
            clearRoomTimers(room);
            delete rooms[roomCode];
        } else {
            io.to(roomCode).emit('player_joined', { players: getSanitizedPlayers(room.players) });
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
      clearRoomTimers(rooms[roomCode]);
      delete rooms[roomCode];
    }
  }
}, 10 * 60 * 1000);

httpServer.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
