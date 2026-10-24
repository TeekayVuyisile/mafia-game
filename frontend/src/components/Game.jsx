import { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';
import { useNarrator } from '../useNarrator';
import Avatar from './Avatar';
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
  ExclamationTriangleFill,
  VolumeUpFill,
  VolumeMuteFill,
  WifiOff,
  MoonStarsFill,
  PersonBadgeFill,
  Crosshair,
  BoxArrowLeft
} from 'react-bootstrap-icons';
import TopBar from './TopBar';

const MAX_CHAT_LENGTH = 300;

const toEndsAt = (seconds) => (typeof seconds === 'number' ? Date.now() + seconds * 1000 : null);

const gameOverNarration = ({ winner, reason, lastEvent }) =>
  [lastEvent, `Game over. ${winner} victory!`, reason].filter(Boolean).join(' ');

// Phase durations mirror the server's timers; used to draw the time bar
const PHASES = {
  RoleAssignment: { label: 'Roles assigned', Icon: PersonBadgeFill, duration: 10 },
  Night: { label: 'Night', Icon: MoonStarsFill, duration: 15 },
  Discussion: { label: 'Discussion', Icon: ChatRightDotsFill, duration: 60 },
  Voting: { label: 'Voting', Icon: PeopleFill, duration: 30 },
  NightResult: { label: 'Verdict', Icon: HourglassSplit, duration: 5 }
};

const SUB_PHASES = { MafiaTurn: "Mafia's turn", MedicTurn: "Medic's turn" };

const ROLE_INFO = {
  Mafia: 'Choose one player to eliminate each night. Blend in during the day.',
  Medic: 'Each night, protect one player (yourself included) from the Mafia.',
  Civilian: 'Find the Mafia. Discuss, then vote out the most suspicious player.'
};

const muted = { color: 'var(--text-secondary)' };
const cardTitle = { letterSpacing: '3px' };

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
  const [progress, setProgress] = useState(null);
  // Other Mafia players' userIds; only ever non-empty when we are Mafia
  const [teammates, setTeammates] = useState(snapshot.teammates || []);
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
      setTeammates(data.teammates || []);
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
    const handleProgress = (data) => setProgress(data);
    // A fellow Mafia changed the shared target
    const handleMafiaTarget = ({ targetUserId, message }) => {
      setSelectedTarget(targetUserId);
      setMessage(message);
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
    socket.on('progress_update', handleProgress);
    socket.on('mafia_target', handleMafiaTarget);
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
      socket.off('progress_update', handleProgress);
      socket.off('mafia_target', handleMafiaTarget);
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

  const topBar = (
    <TopBar>
      <span className="small text-nowrap px-3 py-2 rounded-pill d-none d-sm-inline" style={{ border: '1px solid rgba(200, 169, 107, 0.25)', ...muted, letterSpacing: '1px' }}>
        ROOM <span className="gold-text fw-bold ms-1" style={{ letterSpacing: '3px' }}>{roomCode}</span>
      </span>
      {narrator.supported && (
        <button
          type="button"
          className="icon-btn"
          onClick={narrator.toggleMute}
          aria-label={narrator.muted ? 'Unmute narrator' : 'Mute narrator'}
          title={narrator.muted ? 'Unmute narrator' : 'Mute narrator'}
        >
          {narrator.muted ? <VolumeMuteFill size={18} /> : <VolumeUpFill size={18} />}
        </button>
      )}
      <button type="button" className="icon-btn icon-btn-danger" onClick={handleLeaveRoom} aria-label="Leave game" title="Leave game">
        <BoxArrowLeft size={18} />
      </button>
    </TopBar>
  );

  const banners = (
    <>
      {!connected && (
        <div className="alert d-flex align-items-center mb-4 rounded-4" role="status" style={{ background: 'rgba(139, 0, 0, 0.2)', border: '1px solid var(--role-mafia)', color: 'var(--text-primary)' }}>
          <WifiOff className="me-3 flex-shrink-0" /> Connection lost. Reconnecting to the room…
        </div>
      )}
      {narrator.supported && narrator.blocked && !narrator.muted && (
        <button
          className="btn btn-gold w-100 mb-4 py-3 rounded-3 d-flex align-items-center justify-content-center"
          onClick={narrator.unlock}
        >
          <VolumeUpFill className="me-2" /> Tap to enable the narrator
        </button>
      )}
    </>
  );

  if (gameState === 'GameOver' && winnerData) {
    const mafiaWon = winnerData.winner === 'Mafia';
    return (
      <div className="min-vh-100 d-flex flex-column" style={{ background: 'var(--bg-primary)' }}>
        {topBar}
        <main className="flex-grow-1 py-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="container px-3"
            style={{ maxWidth: '56rem' }}
          >
            {banners}
            <section
              className="text-center rounded-4 p-4 p-md-5 mb-4"
              style={{
                background: mafiaWon ? 'radial-gradient(circle at top, rgba(139, 0, 0, 0.35), transparent 70%)' : 'radial-gradient(circle at top, rgba(200, 169, 107, 0.18), transparent 70%)',
                border: `1px solid ${mafiaWon ? 'var(--role-mafia)' : 'rgba(200, 169, 107, 0.4)'}`
              }}
            >
              <span className="small d-block mb-2" style={{ ...muted, letterSpacing: '3px' }}>GAME OVER</span>
              <h1 className="fw-bold gold-text mb-3" style={{ letterSpacing: '6px', fontSize: 'clamp(1.75rem, 6vw, 3rem)' }}>
                {(winnerData.winner || 'Game').toUpperCase()} WIN
              </h1>
              {winnerData.lastEvent && <p className="mb-1" style={muted}>{winnerData.lastEvent}</p>}
              <p className="mb-0 fw-semibold" style={{ color: 'var(--text-primary)' }}>{winnerData.reason}</p>
            </section>

            {progress && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card glass-panel rounded-4 p-4 mb-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                  <span className="fw-bold gold-text" style={{ letterSpacing: '2px' }}>
                    {progress.won ? 'VICTORY' : 'DEFEAT'} · +{progress.xpGained} XP
                  </span>
                  <span className="small" style={{ ...muted, letterSpacing: '1px' }}>
                    LEVEL {progress.stats.level} · {progress.stats.rank.toUpperCase()}
                  </span>
                </div>
                <div className="progress" style={{ height: '8px', background: 'rgba(255,255,255,0.06)' }} role="progressbar" aria-label="Level progress" aria-valuenow={progress.stats.xpIntoLevel} aria-valuemin={0} aria-valuemax={progress.stats.xpPerLevel}>
                  <div className="progress-bar" style={{ width: `${Math.round((progress.stats.xpIntoLevel / progress.stats.xpPerLevel) * 100)}%`, background: 'var(--accent-gold)' }} />
                </div>
              </motion.section>
            )}

            <section className="card glass-panel rounded-4 p-4 mb-4" aria-labelledby="reveal-heading">
              <h2 id="reveal-heading" className="h6 fw-bold gold-text mb-3" style={cardTitle}>ROLES REVEALED</h2>
              <div className="row g-2">
                {winnerData.players.map(p => (
                  <div key={p.userId} className="col-sm-6">
                    <div className="d-flex align-items-center gap-3 p-2 pe-3 rounded-3 h-100" style={{ border: `1px solid ${getRoleColor(p.role)}`, opacity: p.isAlive ? 1 : 0.55 }}>
                      <Avatar image={p.avatar} name={p.username} size={36} />
                      <span className="flex-grow-1 text-truncate" style={{ color: 'var(--text-primary)' }}>
                        {p.username}
                        {p.userId === userId && <span className="gold-text small ms-2">(you)</span>}
                        {!p.isAlive && <span className="small d-block" style={muted}>Eliminated</span>}
                      </span>
                      <span className="badge rounded-pill" style={{ background: getRoleColor(p.role), color: p.role === 'Civilian' ? '#111' : '#fff', letterSpacing: '1px' }}>
                        {(p.role || 'unknown').toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {isHost ? (
              <div className="d-flex flex-column flex-sm-row gap-3">
                <button className="btn btn-gold btn-lg flex-grow-1 py-3 rounded-3" onClick={() => socket.emit('restart_game', { roomCode })}>
                  <ArrowRepeat className="me-2" /> Play again
                </button>
                <button className="btn btn-lg flex-grow-1 py-3 rounded-3" style={{ border: '1px solid var(--role-mafia)', color: '#ff8a80', background: 'transparent' }} onClick={() => socket.emit('end_game_permanently', { roomCode })}>
                  <XCircleFill className="me-2" /> END SESSION
                </button>
              </div>
            ) : (
              <>
                <button className="btn btn-gold btn-lg w-100 py-3 rounded-3" onClick={handleLeaveRoom}>
                  <BoxArrowLeft className="me-2" /> Leave room
                </button>
                <p className="small text-center mt-3 mb-0" style={muted}>Or stay put: the host can start another round.</p>
              </>
            )}
          </motion.div>
        </main>
      </div>
    );
  }

  const phase = PHASES[gameState] || { label: gameState, Icon: HourglassSplit, duration: 0 };
  const PhaseIcon = phase.Icon;
  const timeShare = timer !== null && phase.duration ? Math.min(100, (timer / phase.duration) * 100) : 0;
  // Warn in the last quarter of the phase rather than a fixed 10s (which is the whole of short phases)
  const timeRunningOut = timer !== null && timer <= Math.ceil((phase.duration || 40) / 4);
  const canActAtNight = gameState === 'Night' && isAlive && ((role === 'Mafia' && subPhase === 'MafiaTurn') || (role === 'Medic' && subPhase === 'MedicTurn'));
  const canVote = gameState === 'Voting' && isAlive;
  const isTeammate = (playerId) => teammates.includes(playerId);
  const teamPlayers = players.filter(p => isTeammate(p.userId));
  const targets = canActAtNight
    ? players.filter(p => p.isAlive && (role === 'Medic' || (p.userId !== userId && !isTeammate(p.userId))))
    : players.filter(p => p.isAlive && p.userId !== userId);
  const mafiaTag = (
    <span className="badge rounded-pill ms-2" style={{ background: 'var(--role-mafia)', color: '#fff', fontSize: '0.62rem', letterSpacing: '1px' }}>
      MAFIA
    </span>
  );

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ background: 'var(--bg-primary)' }}>
      {topBar}
      <main className="flex-grow-1 py-4">
        <div className="container px-3" style={{ maxWidth: '72rem' }}>
          {banners}
          <div className="row g-4">
            <div className="col-lg-8 d-flex flex-column gap-4">
              {/* Phase */}
              <motion.section
                key={`${gameState}-${subPhase}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="card glass-panel rounded-4 overflow-hidden"
                aria-live="polite"
              >
                <div className="p-4 d-flex align-items-start gap-3">
                  <span className="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0" style={{ width: 48, height: 48, background: 'rgba(200, 169, 107, 0.1)', border: '1px solid rgba(200, 169, 107, 0.3)' }}>
                    <PhaseIcon size={22} className="gold-text" />
                  </span>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex flex-wrap align-items-baseline gap-2">
                      <h1 className="h4 fw-bold gold-text mb-0" style={{ letterSpacing: '3px' }}>{phase.label}</h1>
                      {SUB_PHASES[subPhase] && <span className="small" style={muted}>· {SUB_PHASES[subPhase]}</span>}
                    </div>
                    <p className="mb-0 mt-1" style={{ color: 'var(--text-primary)' }}>{message}</p>
                  </div>
                  {timer !== null && (
                    <div className="text-end flex-shrink-0" aria-label={`${timer} seconds left`}>
                      <div className="fs-2 fw-bold lh-1" style={{ color: timeRunningOut ? '#ff6b6b' : 'var(--accent-gold)', fontFamily: 'var(--font-title)' }}>{timer}</div>
                      <div className="small" style={muted}>sec</div>
                    </div>
                  )}
                </div>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }} aria-hidden="true">
                  <div style={{ height: '100%', width: `${timeShare}%`, background: timeRunningOut ? '#ff6b6b' : 'var(--accent-gold)', transition: 'width 0.25s linear' }} />
                </div>
              </motion.section>

              {/* Actions / status */}
              <AnimatePresence mode="wait">
                {canActAtNight || canVote ? (
                  <motion.section
                    key={canVote ? 'vote' : 'night'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="card glass-panel rounded-4 p-4"
                    aria-labelledby="action-heading"
                  >
                    <h2 id="action-heading" className="h6 fw-bold gold-text mb-1 d-flex align-items-center" style={cardTitle}>
                      {canVote ? <PeopleFill className="me-2" /> : role === 'Mafia' ? <Crosshair className="me-2" /> : <ShieldPlus className="me-2" />}
                      {canVote ? 'CAST YOUR VOTE' : role === 'Mafia' ? 'CHOOSE YOUR TARGET' : 'CHOOSE WHO TO PROTECT'}
                    </h2>
                    <p className="small mb-3" style={muted}>
                      {canVote ? 'You can change your vote until the timer runs out.' : 'Your pick is secret. You can change it until your turn ends.'}
                    </p>
                    <div className="row g-2">
                      {targets.map(player => {
                        const selected = selectedTarget === player.userId;
                        return (
                          <div key={player.userId} className="col-sm-6">
                            <button
                              type="button"
                              className="btn w-100 p-3 d-flex align-items-center gap-3 text-start rounded-3"
                              aria-pressed={selected}
                              style={{
                                border: `1px solid ${selected ? 'var(--accent-gold)' : 'rgba(200, 169, 107, 0.15)'}`,
                                background: selected ? 'rgba(200, 169, 107, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                                color: 'var(--text-primary)'
                              }}
                              onClick={() => handleAction(player.userId)}
                            >
                              <Avatar image={player.avatar} name={player.username} size={36} />
                              <span className="flex-grow-1 fw-semibold text-truncate">
                                {player.username}{player.userId === userId && <span className="gold-text small ms-2">(you)</span>}
                                {isTeammate(player.userId) && mafiaTag}
                              </span>
                              {canVote && (
                                <span className="badge rounded-pill" style={{ border: '1px solid rgba(200, 169, 107, 0.5)', color: 'var(--accent-gold)' }} title="Votes">
                                  {voteTally[player.userId] || 0}
                                </span>
                              )}
                              {selected
                                ? <CheckCircleFill className="gold-text flex-shrink-0" size={20} />
                                : <span className="flex-shrink-0 rounded-circle" style={{ width: 20, height: 20, border: '2px solid rgba(200, 169, 107, 0.3)' }} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.section>
                ) : gameState !== 'Discussion' && (
                  <motion.section
                    key="waiting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="card glass-panel rounded-4 p-5 text-center"
                  >
                    {gameState === 'Night'
                      ? <MoonStarsFill size={40} className="gold-text mx-auto mb-3" style={{ opacity: 0.5 }} />
                      : <HourglassSplit size={40} className="gold-text mx-auto mb-3" style={{ opacity: 0.5 }} />}
                    <p className="mb-0" style={muted}>
                      {!isAlive
                        ? 'You have been eliminated. Watch how the rest of the game plays out.'
                        : gameState === 'Night'
                          ? 'Eyes closed. Wait for the night to pass.'
                          : gameState === 'Voting'
                            ? 'Voting is underway.'
                            : 'Stand by…'}
                    </p>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Discussion chat */}
              {gameState === 'Discussion' && (
                <section className="card glass-panel rounded-4 p-4" aria-labelledby="chat-heading">
                  <h2 id="chat-heading" className="h6 fw-bold gold-text mb-3 d-flex align-items-center" style={cardTitle}>
                    <ChatRightDotsFill className="me-2" /> TOWN SQUARE
                  </h2>
                  <div
                    ref={chatBoxRef}
                    onScroll={handleChatScroll}
                    className="rounded-3 p-3 mb-3"
                    style={{ height: '340px', overflowY: 'auto', background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(200, 169, 107, 0.1)' }}
                    aria-live="polite"
                  >
                    {chat.length === 0 && (
                      <p className="text-center mt-5 mb-0 small" style={muted}>No messages yet. Who do you suspect?</p>
                    )}
                    {chat.map((msg) => {
                      const mine = msg.userId === userId;
                      const author = players.find(p => p.userId === msg.userId);
                      return (
                        <div key={msg.id} className={`mb-3 d-flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                          <Avatar image={author?.avatar} name={msg.username} size={30} />
                          <div className={`d-flex flex-column ${mine ? 'align-items-end' : 'align-items-start'}`} style={{ maxWidth: '78%' }}>
                            <small style={{ ...muted, fontSize: '0.72rem' }}>{mine ? 'You' : msg.username} · {formatTime(msg.timestamp)}</small>
                            <div
                              className="px-3 py-2 rounded-3 mt-1"
                              style={{
                                background: mine ? 'rgba(200, 169, 107, 0.14)' : 'rgba(255,255,255,0.06)',
                                border: mine ? '1px solid rgba(200, 169, 107, 0.4)' : '1px solid transparent',
                                color: 'var(--text-primary)',
                                overflowWrap: 'anywhere'
                              }}
                            >
                              {msg.message}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isAlive ? (
                    <>
                      <form onSubmit={handleSendMessage} className="d-flex gap-2">
                        <label htmlFor="chat-input" className="visually-hidden">Message</label>
                        <input
                          id="chat-input"
                          type="text"
                          className="form-control rounded-3 px-3"
                          placeholder={connected ? 'Make your case…' : 'Reconnecting…'}
                          value={inputMessage}
                          maxLength={MAX_CHAT_LENGTH}
                          onChange={(e) => setInputMessage(e.target.value)}
                          style={{ background: '#000', minHeight: 48 }}
                        />
                        <button
                          type="submit"
                          disabled={sending || !connected || !inputMessage.trim()}
                          className="btn btn-gold rounded-3 d-flex align-items-center justify-content-center"
                          style={{ width: 52, minHeight: 48 }}
                          aria-label="Send message"
                        >
                          {sending ? <span className="spinner-border spinner-border-sm" role="status" /> : <SendFill size={18} />}
                        </button>
                      </form>
                      {chatError && (
                        <small className="d-block mt-2" role="alert" style={{ color: '#ff8a80' }}>{chatError}</small>
                      )}
                    </>
                  ) : (
                    <p className="small text-center mb-0" style={muted}>The dead cannot speak, but you can still read along.</p>
                  )}
                </section>
              )}
            </div>

            <aside className="col-lg-4 d-flex flex-column gap-4">
              {/* Role */}
              <section className="card glass-panel rounded-4 p-4" style={{ borderColor: getRoleColor(role) }} aria-labelledby="role-heading">
                <div className="d-flex align-items-center gap-3">
                  {role
                    ? <img src={getRoleIcon(role)} alt="" style={{ width: 64, height: 64, objectFit: 'contain', filter: 'drop-shadow(0 0 10px var(--accent-gold-glow))' }} />
                    : <PersonCircle size={56} style={muted} />}
                  <div style={{ minWidth: 0 }}>
                    <span className="small d-block" style={{ ...muted, letterSpacing: '2px' }}>YOUR ROLE</span>
                    <h2 id="role-heading" className="h4 fw-bold mb-0" style={{ color: getRoleColor(role), letterSpacing: '3px' }}>{role || 'Pending…'}</h2>
                    {!isAlive && <span className="small" style={{ color: '#ff8a80' }}>Eliminated</span>}
                  </div>
                </div>
                {role && <p className="small mb-0 mt-3" style={muted}>{ROLE_INFO[role]}</p>}
                {role === 'Mafia' && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(139, 0, 0, 0.4)' }}>
                    <span className="small d-block mb-2" style={{ ...muted, letterSpacing: '2px' }}>YOUR FAMILY</span>
                    {teamPlayers.length === 0 ? (
                      <p className="small mb-0" style={muted}>You work alone. Trust no one.</p>
                    ) : (
                      <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                        {teamPlayers.map(mate => (
                          <li key={mate.userId} className="d-flex align-items-center gap-2" style={{ opacity: mate.isAlive ? 1 : 0.5 }}>
                            <Avatar image={mate.avatar} name={mate.username} size={28} />
                            <span className="small text-truncate" style={{ color: 'var(--text-primary)' }}>{mate.username}</span>
                            {!mate.isAlive && <span className="small" style={{ color: '#ff8a80' }}>· eliminated</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="small mb-0 mt-2" style={muted}>Only you can see this. You share one kill each night.</p>
                  </div>
                )}
              </section>

              {/* Players */}
              <section className="card glass-panel rounded-4 p-4" aria-labelledby="roster-heading">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h2 id="roster-heading" className="h6 fw-bold gold-text mb-0" style={cardTitle}>PLAYERS</h2>
                  <span className="small" style={muted}>{players.filter(p => p.isAlive).length} alive</span>
                </div>
                <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                  {players.map(player => (
                    <li key={player.userId} className="d-flex align-items-center gap-3">
                      <span style={{ opacity: player.isAlive ? 1 : 0.4, filter: player.isAlive ? 'none' : 'grayscale(1)' }}>
                        <Avatar image={player.avatar} name={player.username} size={34} />
                      </span>
                      <span className={`flex-grow-1 text-truncate ${player.isAlive ? '' : 'text-decoration-line-through'}`} style={{ color: player.isAlive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {player.username}
                        {player.userId === userId && <span className="gold-text small ms-2">(you)</span>}
                        {isTeammate(player.userId) && mafiaTag}
                      </span>
                      {gameState === 'Voting' && player.isAlive && voteTally[player.userId] > 0 && (
                        <span className="badge rounded-pill" style={{ border: '1px solid rgba(200, 169, 107, 0.5)', color: 'var(--accent-gold)' }} title="Votes">
                          {voteTally[player.userId]}
                        </span>
                      )}
                      <span className="small text-nowrap" style={{ color: !player.isAlive ? '#ff8a80' : player.disconnected ? 'var(--text-secondary)' : 'var(--accent-gold)', fontSize: '0.72rem', letterSpacing: '1px' }}>
                        {!player.isAlive ? 'OUT' : player.disconnected ? 'OFFLINE' : 'ALIVE'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Host controls */}
              {isHost && (
                <section className="card glass-panel rounded-4 p-4" aria-labelledby="host-heading">
                  <h2 id="host-heading" className="h6 fw-bold gold-text mb-3" style={cardTitle}>HOST CONTROLS</h2>
                  <div className="d-flex flex-column gap-2">
                    <button className="btn btn-gold rounded-3 py-2" onClick={() => socket.emit('restart_game', { roomCode })}>
                      <ArrowRepeat className="me-2" /> Back to lobby
                    </button>
                    <button className="btn rounded-3 py-2" style={{ border: '1px solid var(--role-mafia)', color: '#ff8a80', background: 'transparent' }} onClick={() => socket.emit('end_game_permanently', { roomCode })}>
                      <ExclamationTriangleFill className="me-2" /> END SESSION
                    </button>
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Game;
