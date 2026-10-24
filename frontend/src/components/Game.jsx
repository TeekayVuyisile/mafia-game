import { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';
import { useNarrator } from '../useNarrator';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldPlus,
  PersonCircle,
  ChatRightDotsFill,
  HourglassSplit,
  CheckCircleFill,
  XCircleFill,
  ArrowRepeat,
  SendFill,
  PeopleFill,
  GearFill,
  ExclamationTriangleFill,
  VolumeUpFill,
  VolumeMuteFill,
  WifiOff
} from 'react-bootstrap-icons';

const MAX_CHAT_LENGTH = 300;

const toEndsAt = (seconds) => (typeof seconds === 'number' ? Date.now() + seconds * 1000 : null);

const gameOverNarration = ({ winner, reason, lastEvent }) =>
  [lastEvent, `Game over. ${winner} victory!`, reason].filter(Boolean).join(' ');

const formatTime = (timestamp) =>
  typeof timestamp === 'number'
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : timestamp;

// `snapshot` is the state to mount into: a fresh game_started payload or a room_reconnected sync
const Game = ({ roomCode, userId, snapshot }) => {
  const [role, setRole] = useState(snapshot.role ?? null);
  const [gameState, setGameState] = useState(snapshot.gameState);
  const [subPhase, setSubPhase] = useState(snapshot.subPhase ?? null);
  const [phaseEndsAt, setPhaseEndsAt] = useState(() => toEndsAt(snapshot.timer));
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState(snapshot.message || (snapshot.role ? `You are a ${snapshot.role}` : 'Wait for your role...'));
  const [players, setPlayers] = useState(snapshot.players || []);
  const [chat, setChat] = useState(snapshot.chat || []);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [voteTally, setVoteTally] = useState(snapshot.voteTally || {});
  const [winnerData, setWinnerData] = useState(snapshot.result || null);
  const [selectedTarget, setSelectedTarget] = useState(snapshot.myTarget ?? null);
  const [connected, setConnected] = useState(socket.connected);
  const chatBoxRef = useRef(null);
  const stickToBottom = useRef(true);

  const narrator = useNarrator();
  const { speak } = narrator;

  // Narrate the state we mounted into (game start, or a page-reload reconnect)
  useEffect(() => {
    speak(snapshot.result ? gameOverNarration(snapshot.result) : snapshot.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak]);

  useEffect(() => {
    const startPhaseClock = (seconds) => {
      setNow(Date.now());
      setPhaseEndsAt(toEndsAt(seconds));
    };

    // Server re-sent the full state after our socket reconnected
    const handleResync = (data) => {
      setGameState(data.gameState);
      setSubPhase(data.subPhase ?? null);
      setMessage(data.message);
      setRole(data.role ?? null);
      if (data.players) setPlayers(data.players);
      setChat(data.chat || []);
      setVoteTally(data.voteTally || {});
      setWinnerData(data.result || null);
      setSelectedTarget(data.myTarget ?? null);
      startPhaseClock(data.timer);
      speak(data.result ? gameOverNarration(data.result) : data.message);
    };

    const handlePhaseChange = ({ gameState, subPhase, message, timer, players }) => {
      setGameState(gameState);
      setSubPhase(subPhase ?? null);
      setMessage(message);
      startPhaseClock(timer);
      setSelectedTarget(null);
      setChatError(null);
      if (players) setPlayers(players);
      setVoteTally({});
      speak(message);
    };

    const handleReceiveMessage = (msg) =>
      setChat(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    const handleActionConfirmed = ({ message }) => setMessage(message);
    const handleVoteUpdate = ({ tally }) => setVoteTally(tally);
    const handlePlayersUpdate = ({ players }) => setPlayers(players);
    const handleGameOver = (data) => {
      setGameState('GameOver');
      setWinnerData(data);
      setPhaseEndsAt(null);
      speak(gameOverNarration(data));
    };
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on('room_reconnected', handleResync);
    socket.on('phase_change', handlePhaseChange);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('action_confirmed', handleActionConfirmed);
    socket.on('vote_update', handleVoteUpdate);
    socket.on('player_joined', handlePlayersUpdate);
    socket.on('player_left', handlePlayersUpdate);
    socket.on('game_over', handleGameOver);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('room_reconnected', handleResync);
      socket.off('phase_change', handlePhaseChange);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('action_confirmed', handleActionConfirmed);
      socket.off('vote_update', handleVoteUpdate);
      socket.off('player_joined', handlePlayersUpdate);
      socket.off('player_left', handlePlayersUpdate);
      socket.off('game_over', handleGameOver);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [speak]);

  // Count down against an absolute deadline so the clock can't drift or stall
  useEffect(() => {
    if (!phaseEndsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [phaseEndsAt]);

  const timer = phaseEndsAt ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000)) : null;

  // Follow new messages unless the player has scrolled up to read history
  useEffect(() => {
    const box = chatBoxRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [chat, gameState]);

  const handleChatScroll = () => {
    const box = chatBoxRef.current;
    if (box) stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  };

  const handleAction = (targetUserId) => {
    setSelectedTarget(targetUserId);
    if (gameState === 'Night') {
      if (role === 'Mafia' && subPhase === 'MafiaTurn') socket.emit('submit_mafia_action', { roomCode, targetUserId });
      else if (role === 'Medic' && subPhase === 'MedicTurn') socket.emit('submit_medic_action', { roomCode, targetUserId });
    } else if (gameState === 'Voting') {
      socket.emit('submit_vote', { roomCode, targetUserId });
    }
  };

  const handleLeaveRoom = () => {
    if (window.confirm("Are you sure you want to leave the game?")) {
      socket.emit('leave_room_explicitly', { roomCode, userId });
      localStorage.removeItem('mafia-room-code');
      window.location.reload();
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    const text = inputMessage.trim();
    if (!text || sending) return;
    // Socket.io buffers emits while offline and would replay them later, causing duplicates on retry
    if (!socket.connected) return setChatError('Connection lost. Reconnecting...');

    setSending(true);
    setChatError(null);
    stickToBottom.current = true;
    socket.timeout(5000).emit('send_message', { roomCode, message: text }, (err, res) => {
      setSending(false);
      if (err) return setChatError('Message not delivered. Try again.');
      if (!res?.ok) return setChatError(res?.error || 'Message rejected.');
      // Keep anything typed while the message was in flight
      setInputMessage(prev => (prev.trim() === text ? '' : prev));
    });
  };

  const getRoleIcon = (roleName) => {
    switch(roleName) {
      case 'Mafia': return '/mafia.png';
      case 'Medic': return '/medic.png';
      case 'Civilian': return '/civilian.png';
      default: return null;
    }
  };

  const getRoleColor = (roleName) => {
    switch(roleName) {
      case 'Mafia': return 'var(--role-mafia)';
      case 'Medic': return 'var(--role-medic)';
      case 'Civilian': return 'var(--role-civilian)';
      default: return 'var(--accent-gold)';
    }
  };

  const me = players.find(p => p.userId === userId);
  const isAlive = me?.isAlive ?? true;
  const isHost = me?.isHost;

  const narratorBanner = narrator.supported && narrator.blocked && !narrator.muted && (
    <button
      className="btn btn-gold w-100 mb-4 py-3 d-flex align-items-center justify-content-center"
      onClick={narrator.unlock}
    >
      <VolumeUpFill className="me-2" /> TAP TO ENABLE THE NARRATOR
    </button>
  );

  const connectionBanner = !connected && (
    <div className="alert d-flex align-items-center mb-4 rounded-4" style={{ background: 'rgba(139, 0, 0, 0.2)', border: '1px solid var(--role-mafia)', color: 'var(--text-primary)' }}>
      <WifiOff className="me-3" /> Connection lost. Reconnecting to the room...
    </div>
  );

  if (gameState === 'GameOver' && winnerData) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="container min-vh-100 d-flex flex-column align-items-center justify-content-center py-5"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div style={{ width: '100%', maxWidth: '800px' }}>
          {connectionBanner}
          {narratorBanner}
        </div>
        <div className="card shadow-lg border-0 glass-panel overflow-hidden gold-border" style={{ width: '100%', maxWidth: '800px', borderRadius: '30px' }}>
          <div className={`p-5 text-center ${winnerData.winner === 'Mafia' ? 'pulse-red' : 'gold-glow'}`} style={{ background: winnerData.winner === 'Mafia' ? 'rgba(139, 0, 0, 0.2)' : 'rgba(200, 169, 107, 0.1)' }}>
            <h1 className="display-3 fw-bold mb-0 gold-text" style={{ letterSpacing: '10px' }}>{(winnerData.winner || 'GAME').toUpperCase()} VICTORIOUS</h1>
          </div>
          <div className="card-body p-5">
            {winnerData.lastEvent && (
              <p className="text-center mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>{winnerData.lastEvent}</p>
            )}
            <h4 className="text-center mb-5" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', textTransform: 'none' }}>{winnerData.reason}</h4>
            <div className="row g-4">
              {winnerData.players.map(p => (
                <div key={p.userId} className="col-md-6">
                  <div className={`p-3 rounded-4 d-flex justify-content-between align-items-center ${p.isAlive ? 'glass-panel' : 'opacity-25'}`} style={{ border: `1px solid ${getRoleColor(p.role)}` }}>
                    <div className="d-flex align-items-center">
                       <img src={getRoleIcon(p.role)} alt={p.role} style={{ width: '30px', marginRight: '15px' }} />
                       <span className="fw-bold" style={{ letterSpacing: '1px' }}>{p.username}</span>
                    </div>
                    <span className="badge rounded-pill" style={{ background: getRoleColor(p.role), fontSize: '0.7rem', letterSpacing: '1px' }}>
                      {(p.role || 'unknown').toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {isHost ? (
              <div className="mt-5 d-flex gap-3">
                <button className="btn btn-gold btn-lg flex-grow-1 py-3" onClick={() => socket.emit('restart_game', { roomCode })}>
                  <ArrowRepeat className="me-2" /> PLAY AGAIN
                </button>
                <button className="btn btn-outline-danger btn-lg flex-grow-1 py-3 rounded-pill" style={{ border: '1px solid var(--role-mafia)', color: 'var(--role-mafia)' }} onClick={() => socket.emit('end_game_permanently', { roomCode })}>
                  <XCircleFill className="me-2" /> END SESSION
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <button className="btn btn-gold btn-lg w-100 py-3" onClick={handleLeaveRoom}>
                  <XCircleFill className="me-2" /> RETURN TO LOBBY
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="container-fluid min-vh-100 py-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="row g-4 h-100 px-lg-4">
        <div className="col-lg-8">
          {connectionBanner}
          {narratorBanner}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="card glass-panel shadow-lg mb-4 gold-border"
            style={{ borderRadius: '25px', overflow: 'hidden' }}
          >
            <div className="card-header p-4 d-flex justify-content-between align-items-center border-0" style={{ background: 'rgba(200, 169, 107, 0.05)' }}>
              <div className="d-flex align-items-center">
                <div className="p-3 rounded-circle me-3 gold-glow" style={{ background: 'rgba(200, 169, 107, 0.1)', border: '1px solid var(--accent-gold)' }}>
                  <HourglassSplit className={gameState === 'Voting' ? 'pulse-red' : ''} size={24} color="var(--accent-gold)" />
                </div>
                <div>
                  <h4 className="mb-0 fw-bold gold-text" style={{ letterSpacing: '3px' }}>{gameState} PHASE</h4>
                  <small style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>{message}</small>
                </div>
              </div>
              <div className="d-flex gap-4 align-items-center">
                {timer !== null && (
                  <div className="text-end">
                    <div className="fs-2 fw-bold" style={{ color: timer <= 10 ? 'var(--role-mafia)' : 'var(--accent-gold)', fontFamily: 'var(--font-title)' }}>{timer}s</div>
                  </div>
                )}
                {narrator.supported && (
                  <button
                    className="btn btn-link gold-text p-0"
                    title={narrator.muted ? 'Unmute narrator' : 'Mute narrator'}
                    aria-label={narrator.muted ? 'Unmute narrator' : 'Mute narrator'}
                    onClick={narrator.toggleMute}
                  >
                    {narrator.muted ? <VolumeMuteFill size={22} /> : <VolumeUpFill size={22} />}
                  </button>
                )}
                <button className="btn btn-link gold-text text-decoration-none fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '1px' }} onClick={handleLeaveRoom}>
                  ABANDON
                </button>
              </div>
            </div>

            <div className="card-body p-4" style={{ minHeight: '450px' }}>
              <AnimatePresence mode="wait">
                {gameState === 'Night' && isAlive && ((role === 'Mafia' && subPhase === 'MafiaTurn') || (role === 'Medic' && subPhase === 'MedicTurn')) ? (
                  <motion.div
                    key="night-actions"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <h5 className="mb-4 d-flex align-items-center gold-text">
                      {role === 'Mafia' ? <XCircleFill className="text-danger me-3 pulse-red"/> : <ShieldPlus className="text-success me-3"/>}
                      {role === 'Mafia' ? 'SELECT YOUR CONTRACT' : 'SELECT YOUR PROTECTION'}
                    </h5>
                    <div className="row g-3">
                      {players.filter(p => p.isAlive && (role === 'Medic' || p.userId !== userId)).map(player => (
                        <div key={player.userId} className="col-md-6">
                          <button
                            className={`btn btn-lg w-100 p-4 text-start d-flex justify-content-between align-items-center rounded-4 transition-all ${
                              selectedTarget === player.userId
                                ? 'gold-border gold-glow'
                                : 'glass-panel'
                            }`}
                            style={{
                              borderWidth: '2px',
                              background: selectedTarget === player.userId ? 'rgba(200, 169, 107, 0.1)' : 'rgba(255,255,255,0.03)',
                              color: 'var(--text-primary)'
                            }}
                            onClick={() => handleAction(player.userId)}
                          >
                            <span className="fw-bold h5 mb-0" style={{ letterSpacing: '1px' }}>{player.username}</span>
                            {selectedTarget === player.userId ? <CheckCircleFill className="gold-text" size={24} /> : <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid rgba(200, 169, 107, 0.3)' }} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : gameState === 'Voting' && isAlive ? (
                  <motion.div
                    key="voting-actions"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <h5 className="mb-4 d-flex align-items-center gold-text">
                      <PeopleFill className="me-3"/> CAST YOUR VOTE
                    </h5>
                    <div className="row g-3">
                      {players.filter(p => p.isAlive && p.userId !== userId).map(player => (
                        <div key={player.userId} className="col-md-6">
                          <button
                            className={`btn btn-lg w-100 p-4 text-start d-flex justify-content-between align-items-center rounded-4 transition-all ${
                              selectedTarget === player.userId ? 'gold-border gold-glow' : 'glass-panel'
                            }`}
                            style={{
                              borderWidth: '2px',
                              background: selectedTarget === player.userId ? 'rgba(200, 169, 107, 0.1)' : 'rgba(255,255,255,0.03)',
                              color: 'var(--text-primary)'
                            }}
                            onClick={() => handleAction(player.userId)}
                          >
                            <span className="fw-bold h5 mb-0" style={{ letterSpacing: '1px' }}>{player.username}</span>
                            <span className="badge rounded-pill p-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)' }}>
                              {voteTally[player.userId] || 0} VOTES
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="text-center py-5">
                    <div className="mb-4 opacity-25">
                       {gameState === 'Night' ? <img src="/favicon.svg" width="100" style={{ filter: 'grayscale(1) brightness(2)' }} /> : <ChatRightDotsFill size={80} className="gold-text" />}
                    </div>
                    <p className="gold-text h4 px-5" style={{ letterSpacing: '1px', lineHeight: '1.6' }}>{message}</p>
                  </div>
                )}
              </AnimatePresence>

              {gameState === 'Discussion' && (
                <div className="mt-5">
                  <div
                    ref={chatBoxRef}
                    onScroll={handleChatScroll}
                    className="glass-panel p-4 mb-3"
                    style={{ height: '350px', overflowY: 'auto', border: '1px solid rgba(200, 169, 107, 0.1)' }}
                  >
                    {chat.length === 0 && (
                      <p className="text-center mt-5 mb-0" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', letterSpacing: '1px' }}>
                        NO MESSAGES YET. WHO DO YOU SUSPECT?
                      </p>
                    )}
                    {chat.map((msg) => {
                      const mine = msg.userId === userId;
                      return (
                        <div key={msg.id} className={`mb-4 d-flex flex-column ${mine ? 'align-items-end' : 'align-items-start'}`}>
                          <small style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', letterSpacing: '1px' }}>{msg.username.toUpperCase()} • {formatTime(msg.timestamp)}</small>
                          <div className={`p-3 rounded-4 mt-2 ${mine ? 'gold-border' : ''}`}
                               style={{
                                 maxWidth: '80%',
                                 background: mine ? 'rgba(200, 169, 107, 0.1)' : 'rgba(255,255,255,0.05)',
                                 fontSize: '0.95rem',
                                 overflowWrap: 'anywhere'
                               }}>
                            {msg.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isAlive ? (
                    <>
                      <form onSubmit={handleSendMessage} className="d-flex gap-2">
                        <input
                          type="text"
                          className="form-control form-control-lg rounded-pill px-4"
                          placeholder={connected ? 'SEND A CODED MESSAGE...' : 'RECONNECTING...'}
                          value={inputMessage}
                          maxLength={MAX_CHAT_LENGTH}
                          style={{ fontSize: '0.9rem', letterSpacing: '1px' }}
                          onChange={(e) => setInputMessage(e.target.value)}
                        />
                        <button
                          type="submit"
                          disabled={sending || !connected || !inputMessage.trim()}
                          className="btn btn-gold rounded-circle p-3 d-flex align-items-center justify-content-center"
                        >
                          {sending ? <span className="spinner-border spinner-border-sm" role="status" /> : <SendFill size={20} />}
                        </button>
                      </form>
                      {chatError && (
                        <small className="d-block mt-2 ps-3" style={{ color: 'var(--role-mafia)' }}>{chatError}</small>
                      )}
                    </>
                  ) : (
                    <p className="text-center mb-0" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '1px' }}>
                      THE DEAD CANNOT SPEAK. YOU CAN STILL READ ALONG.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {isHost && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="card glass-panel p-4 border-0 shadow-lg"
              style={{ borderRadius: '20px' }}
            >
              <div className="d-flex align-items-center mb-3">
                <GearFill className="gold-text me-3" />
                <h6 className="mb-0 fw-bold gold-text" style={{ letterSpacing: '2px' }}>COMMANDER OVERRIDE</h6>
              </div>
              <div className="d-flex gap-3">
                <button className="btn btn-outline-warning btn-sm rounded-pill px-4 fw-bold" style={{ fontSize: '0.7rem' }} onClick={() => socket.emit('restart_game', { roomCode })}>
                  <ArrowRepeat className="me-1" /> RESET MISSION
                </button>
                <button className="btn btn-outline-danger btn-sm rounded-pill px-4 fw-bold" style={{ fontSize: '0.7rem' }} onClick={() => socket.emit('end_game_permanently', { roomCode })}>
                  <ExclamationTriangleFill className="me-1" /> TERMINATE FREQUENCY
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="col-lg-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="d-flex flex-column gap-4 h-100"
          >
            <div className="card glass-panel p-4 text-center gold-border gold-glow" style={{ borderRadius: '25px' }}>
              <div className="mb-3 mx-auto">
                 {role ? <img src={getRoleIcon(role)} alt={role} style={{ width: '80px', filter: 'drop-shadow(0 0 10px var(--accent-gold-glow))' }} /> : <PersonCircle size={60} className="text-secondary" />}
              </div>
              <h5 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '2px' }}>YOUR ASSIGNMENT</h5>
              <h2 className="fw-bold mt-2" style={{ color: getRoleColor(role), letterSpacing: '4px' }}>{role || 'PENDING...'}</h2>
            </div>

            <div className="card glass-panel border-0 shadow-lg flex-grow-1 overflow-hidden" style={{ borderRadius: '25px' }}>
              <div className="card-header p-4 border-0" style={{ background: 'rgba(200, 169, 107, 0.05)' }}>
                <h5 className="mb-0 fw-bold gold-text" style={{ letterSpacing: '2px' }}>CONSPIRATORS</h5>
              </div>
              <div className="list-group list-group-flush overflow-auto" style={{ maxHeight: '550px' }}>
                {players.map(player => (
                  <div key={player.userId} className="list-group-item d-flex justify-content-between align-items-center p-4 bg-transparent border-0" style={{ borderBottom: '1px solid rgba(200, 169, 107, 0.05) !important' }}>
                    <div className="d-flex align-items-center">
                      <div
                        className="p-1 rounded-circle me-3"
                        style={{ border: `2px solid ${player.isAlive ? 'var(--accent-gold)' : 'var(--text-secondary)'}` }}
                      >
                         <div className="p-1 rounded-circle" style={{ background: player.isAlive ? 'var(--accent-gold)' : 'transparent', width: '8px', height: '8px' }} />
                      </div>
                      <span className={`h6 mb-0 ${!player.isAlive ? 'text-decoration-line-through opacity-50' : 'fw-bold'}`} style={{ letterSpacing: '1px' }}>
                        {player.username} {player.userId === userId && <span className="gold-text ms-2">(YOU)</span>}
                      </span>
                    </div>
                    {!player.isAlive ? (
                      <span className="small text-danger fw-bold" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>ELIMINATED</span>
                    ) : player.disconnected ? (
                      <span className="small fw-bold" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: 'var(--text-secondary)' }}>OFFLINE</span>
                    ) : (
                      <span className="small gold-text fw-bold" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>ACTIVE</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Game;
