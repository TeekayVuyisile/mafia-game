import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { useNarrator } from '../useNarrator';
import Avatar from './Avatar';
import ChatPanel from './ChatPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldPlus,
  PersonCircle,
  ChatRightDotsFill,
  HourglassSplit,
  CheckCircleFill,
  XCircleFill,
  ArrowRepeat,
  PeopleFill,
  ExclamationTriangleFill,
  ForwardFill,
  VolumeUpFill,
  VolumeMuteFill,
  WifiOff,
  MoonStarsFill,
  PersonBadgeFill,
  Crosshair,
  BoxArrowLeft,
  Search,
  ChatSquareQuoteFill,
  Hurricane
} from 'react-bootstrap-icons';
import TopBar from './TopBar';

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

const SUB_PHASES = { MafiaTurn: "Mafia's turn", MedicTurn: "Medic's turn", DetectiveTurn: "Detective's turn" };

const SKIP_VOTE = 'skip';

// Discussion and voting lengths are host settings; the rest are fixed on the server
const phaseDuration = (gameState, settings) => {
  if (gameState === 'Discussion') return settings?.discussionTime ?? PHASES.Discussion.duration;
  if (gameState === 'Voting') return settings?.votingTime ?? PHASES.Voting.duration;
  return PHASES[gameState]?.duration ?? 0;
};

const ROLE_INFO = {
  Mafia: 'Choose one player to eliminate each night. Blend in during the day.',
  Medic: 'Each night, protect one player (yourself included) from the Mafia.',
  Detective: 'Each night, investigate one player to learn whether they are Mafia. Share what you know carefully.',
  Civilian: 'Find the Mafia. Discuss, then vote out the most suspicious player.'
};

const muted = { color: 'var(--text-secondary)' };
const cardTitle = { letterSpacing: '3px' };


// `snapshot` is the state to mount into: a fresh game_started payload or a room_reconnected sync
const Game = ({ roomCode, userId, snapshot }) => {
  const [role, setRole] = useState(snapshot.role ?? null);
  const [gameState, setGameState] = useState(snapshot.gameState);
  const [subPhase, setSubPhase] = useState(snapshot.subPhase ?? null);
  const [phaseEndsAt, setPhaseEndsAt] = useState(() => toEndsAt(snapshot.timer));
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState(snapshot.message || (snapshot.role ? `You are a ${snapshot.role}` : 'Wait for your role...'));
  const [players, setPlayers] = useState(snapshot.players || []);
  // town = discussion chat, mafia = private night line, ghost = graveyard for eliminated players
  const [chats, setChats] = useState({ town: snapshot.chat || [], mafia: snapshot.mafiaChat || [], ghost: snapshot.ghostChat || [] });
  // Detective case notes: [{ night, userId, username, isMafia }]
  const [investigations, setInvestigations] = useState(snapshot.investigations || []);
  const [voteTally, setVoteTally] = useState(snapshot.voteTally || {});
  // voterId -> targetId, only populated when the host made votes public
  const [publicVotes, setPublicVotes] = useState(snapshot.votes || null);
  // Final ballot shown during the verdict phase
  const [voteResult, setVoteResult] = useState(snapshot.voteResult || null);
  const [settings, setSettings] = useState(snapshot.settings || null);
  const [clockLength, setClockLength] = useState(() => phaseDuration(snapshot.gameState, snapshot.settings));
  const [winnerData, setWinnerData] = useState(snapshot.result || null);
  const [selectedTarget, setSelectedTarget] = useState(snapshot.myTarget ?? null);
  const [connected, setConnected] = useState(socket.connected);
  const [progress, setProgress] = useState(null);
  // Other Mafia players' userIds; only ever non-empty when we are Mafia
  const [teammates, setTeammates] = useState(snapshot.teammates || []);

  const narrator = useNarrator();
  const { speak } = narrator;

  // Narrate the state we mounted into (game start, or a page-reload reconnect)
  useEffect(() => {
    speak(snapshot.result ? gameOverNarration(snapshot.result) : snapshot.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak]);

  useEffect(() => {
    const startPhaseClock = (seconds, length = seconds) => {
      setNow(Date.now());
      setPhaseEndsAt(toEndsAt(seconds));
      setClockLength(length);
    };

    // Server re-sent the full state after our socket reconnected
    const handleResync = (data) => {
      setGameState(data.gameState);
      setSubPhase(data.subPhase ?? null);
      setMessage(data.message);
      setRole(data.role ?? null);
      if (data.players) setPlayers(data.players);
      setChats({ town: data.chat || [], mafia: data.mafiaChat || [], ghost: data.ghostChat || [] });
      setInvestigations(data.investigations || []);
      setVoteTally(data.voteTally || {});
      setPublicVotes(data.votes || null);
      setVoteResult(data.voteResult || null);
      setSettings(data.settings || null);
      setWinnerData(data.result || null);
      setSelectedTarget(data.myTarget ?? null);
      setTeammates(data.teammates || []);
      startPhaseClock(data.timer, Math.max(data.timer ?? 0, phaseDuration(data.gameState, data.settings)));
      speak(data.result ? gameOverNarration(data.result) : data.message);
    };

    const handlePhaseChange = ({ gameState, subPhase, message, timer, players, voteResult }) => {
      setGameState(gameState);
      setSubPhase(subPhase ?? null);
      setMessage(message);
      startPhaseClock(timer);
      setSelectedTarget(null);
      if (players) setPlayers(players);
      setVoteTally({});
      setPublicVotes(null);
      setVoteResult(voteResult || null);
      speak(message);
    };

    // Everyone voted, so the server is closing the ballot early
    const handlePhaseTimer = ({ timer, message }) => {
      startPhaseClock(timer);
      setMessage(message);
      speak(message);
    };

    const handleReceiveMessage = (msg) => {
      const channel = msg.channel || 'town';
      setChats(prev => (prev[channel]?.some(m => m.id === msg.id) ? prev : { ...prev, [channel]: [...(prev[channel] || []), msg] }));
    };
    // Full history for a channel we just gained access to (e.g. the graveyard on death)
    const handleChatHistory = ({ channel, messages }) => setChats(prev => ({ ...prev, [channel]: messages || [] }));
    const handleInvestigation = (finding) => {
      setInvestigations(prev => (prev.some(i => i.night === finding.night) ? prev : [...prev, finding]));
      setSelectedTarget(finding.userId);
    };
    const handleActionConfirmed = ({ message }) => setMessage(message);
    const handleVoteUpdate = ({ tally, votes }) => {
      setVoteTally(tally);
      setPublicVotes(votes || null);
    };
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
    socket.on('chat_history', handleChatHistory);
    socket.on('investigation_result', handleInvestigation);
    socket.on('action_confirmed', handleActionConfirmed);
    socket.on('vote_update', handleVoteUpdate);
    socket.on('phase_timer', handlePhaseTimer);
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
      socket.off('chat_history', handleChatHistory);
      socket.off('investigation_result', handleInvestigation);
      socket.off('action_confirmed', handleActionConfirmed);
      socket.off('vote_update', handleVoteUpdate);
      socket.off('phase_timer', handlePhaseTimer);
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

  const handleAction = (targetUserId) => {
    setSelectedTarget(targetUserId);
    if (gameState === 'Night') {
      if (role === 'Mafia' && subPhase === 'MafiaTurn') socket.emit('submit_mafia_action', { roomCode, targetUserId });
      else if (role === 'Medic' && subPhase === 'MedicTurn') socket.emit('submit_medic_action', { roomCode, targetUserId });
      else if (role === 'Detective' && subPhase === 'DetectiveTurn') socket.emit('submit_detective_action', { roomCode, targetUserId });
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

  // Resolves to the server ack so ChatPanel can keep the text on failure
  const sendChat = (channel) => (text) => new Promise(resolve => {
    socket.timeout(5000).emit('send_message', { roomCode, message: text, channel }, (err, res) => {
      resolve(err ? { ok: false, error: 'Message not delivered. Try again.' } : res);
    });
  });

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
      case 'Detective': return 'var(--role-detective)';
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
  const timeShare = timer !== null && clockLength ? Math.min(100, (timer / clockLength) * 100) : 0;
  // Warn in the last quarter of the phase rather than a fixed 10s (which is the whole of short phases)
  const timeRunningOut = timer !== null && timer <= Math.ceil((clockLength || 40) / 4);
  const playerById = (id) => players.find(p => p.userId === id);
  const votersFor = (targetId) => (publicVotes
    ? Object.entries(publicVotes).filter(([, target]) => target === targetId).map(([voter]) => playerById(voter)).filter(Boolean)
    : []);

  const voterStack = (voters) => voters.length > 0 && (
    <span className="d-flex align-items-center" aria-label={`Voted by ${voters.map(v => v.username).join(', ')}`}>
      {voters.slice(0, 5).map((voter, index) => (
        <span key={voter.userId} title={voter.username} style={{ marginLeft: index ? -8 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--bg-secondary)' }}>
          <Avatar image={voter.avatar} name={voter.username} size={22} />
        </span>
      ))}
      {voters.length > 5 && <span className="small ms-1" style={muted}>+{voters.length - 5}</span>}
    </span>
  );
  const canActAtNight = gameState === 'Night' && isAlive && (
    (role === 'Mafia' && subPhase === 'MafiaTurn')
    || (role === 'Medic' && subPhase === 'MedicTurn')
    || (role === 'Detective' && subPhase === 'DetectiveTurn')
  );
  // The Detective gets one answer per night; lock the choices once it arrives
  const investigationLocked = role === 'Detective' && subPhase === 'DetectiveTurn' && selectedTarget !== null;
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
                      {canVote ? <PeopleFill className="me-2" /> : role === 'Mafia' ? <Crosshair className="me-2" /> : role === 'Detective' ? <Search className="me-2" /> : <ShieldPlus className="me-2" />}
                      {canVote ? 'CAST YOUR VOTE' : role === 'Mafia' ? 'CHOOSE YOUR TARGET' : role === 'Detective' ? 'CHOOSE WHO TO INVESTIGATE' : 'CHOOSE WHO TO PROTECT'}
                    </h2>
                    <p className="small mb-3" style={muted}>
                      {canVote
                        ? `You can change your vote until voting closes. ${settings?.voteVisibility === 'public' ? 'Votes are public: everyone sees who you pick.' : 'Votes are anonymous: only totals are shown.'}`
                        : role === 'Detective'
                          ? (investigationLocked ? 'Investigation complete. Check your case notes.' : 'One investigation per night. The answer is final.')
                          : 'Your pick is secret. You can change it until your turn ends.'}
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
                              disabled={investigationLocked && !selected}
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
                              {canVote && voterStack(votersFor(player.userId))}
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
                      {canVote && (
                        <div className="col-12">
                          <button
                            type="button"
                            className="btn w-100 p-3 d-flex align-items-center gap-3 text-start rounded-3"
                            aria-pressed={selectedTarget === SKIP_VOTE}
                            style={{
                              border: `1px dashed ${selectedTarget === SKIP_VOTE ? 'var(--accent-gold)' : 'rgba(200, 169, 107, 0.25)'}`,
                              background: selectedTarget === SKIP_VOTE ? 'rgba(200, 169, 107, 0.12)' : 'transparent',
                              color: 'var(--text-primary)'
                            }}
                            onClick={() => handleAction(SKIP_VOTE)}
                          >
                            <span className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0" style={{ width: 36, height: 36, border: '1px dashed rgba(200, 169, 107, 0.4)' }}>
                              <ForwardFill size={16} className="gold-text" />
                            </span>
                            <span className="flex-grow-1">
                              <span className="fw-semibold d-block">Skip vote</span>
                              <span className="small" style={muted}>If skip wins or ties, no one is eliminated.</span>
                            </span>
                            {voterStack(votersFor(SKIP_VOTE))}
                            <span className="badge rounded-pill" style={{ border: '1px solid rgba(200, 169, 107, 0.5)', color: 'var(--accent-gold)' }} title="Votes">
                              {voteTally[SKIP_VOTE] || 0}
                            </span>
                            {selectedTarget === SKIP_VOTE
                              ? <CheckCircleFill className="gold-text flex-shrink-0" size={20} />
                              : <span className="flex-shrink-0 rounded-circle" style={{ width: 20, height: 20, border: '2px solid rgba(200, 169, 107, 0.3)' }} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.section>
                ) : gameState === 'NightResult' && voteResult ? (
                  <motion.section
                    key="ballot"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="card glass-panel rounded-4 p-4"
                    aria-labelledby="ballot-heading"
                  >
                    <h2 id="ballot-heading" className="h6 fw-bold gold-text mb-3" style={cardTitle}>BALLOT RESULTS</h2>
                    {Object.keys(voteResult.tally).length === 0 ? (
                      <p className="small mb-0" style={muted}>No votes were cast.</p>
                    ) : (
                      <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                        {Object.entries(voteResult.tally).sort((a, b) => b[1] - a[1]).map(([targetId, count]) => {
                          const target = targetId === SKIP_VOTE ? null : playerById(targetId);
                          const voters = voteResult.votes
                            ? Object.entries(voteResult.votes).filter(([, t]) => t === targetId).map(([v]) => playerById(v)).filter(Boolean)
                            : [];
                          return (
                            <li key={targetId} className="d-flex align-items-center gap-3 p-2 rounded-3" style={{ border: '1px solid rgba(200, 169, 107, 0.12)' }}>
                              {target
                                ? <Avatar image={target.avatar} name={target.username} size={32} />
                                : <span className="d-inline-flex align-items-center justify-content-center rounded-circle" style={{ width: 32, height: 32, border: '1px dashed rgba(200, 169, 107, 0.4)' }}><ForwardFill size={14} className="gold-text" /></span>}
                              <span className="flex-grow-1 text-truncate" style={{ color: 'var(--text-primary)' }}>
                                {target ? target.username : 'Skip'}
                                {voters.length > 0 && (
                                  <span className="d-block small text-truncate" style={muted}>by {voters.map(v => v.username).join(', ')}</span>
                                )}
                              </span>
                              <span className="badge rounded-pill" style={{ border: '1px solid rgba(200, 169, 107, 0.5)', color: 'var(--accent-gold)' }}>
                                {count} {count === 1 ? 'vote' : 'votes'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {!voteResult.votes && <p className="small mb-0 mt-3" style={muted}>Votes were anonymous.</p>}
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

              {gameState === 'Discussion' && (
                <ChatPanel
                  id="town-chat"
                  channel="town"
                  title="TOWN SQUARE"
                  Icon={ChatRightDotsFill}
                  messages={chats.town}
                  players={players}
                  userId={userId}
                  connected={connected}
                  canSend={isAlive}
                  readOnlyNote="The dead cannot speak here. Talk to the others in the graveyard."
                  placeholder="Make your case…"
                  emptyText="No messages yet. Who do you suspect?"
                  onSend={sendChat('town')}
                  height={340}
                />
              )}

              {role === 'Mafia' && gameState === 'Night' && (
                <ChatPanel
                  id="mafia-chat"
                  channel="mafia"
                  title="THE FAMILY LINE"
                  Icon={ChatSquareQuoteFill}
                  note="Only the Mafia can read this, and only at night."
                  messages={chats.mafia}
                  players={players}
                  userId={userId}
                  connected={connected}
                  canSend={isAlive}
                  readOnlyNote="You've been eliminated, so you can only listen in."
                  placeholder="Plan tonight's hit…"
                  emptyText={teammates.length ? 'Coordinate with your family before you strike.' : 'No family tonight. Notes to yourself only.'}
                  onSend={sendChat('mafia')}
                  height={220}
                />
              )}

              {role && !isAlive && (
                <ChatPanel
                  id="ghost-chat"
                  channel="ghost"
                  title="THE GRAVEYARD"
                  Icon={Hurricane}
                  note="Only eliminated players can see this. The living can't hear you."
                  messages={chats.ghost}
                  players={players}
                  userId={userId}
                  connected={connected}
                  canSend
                  placeholder="Whisper from beyond…"
                  emptyText="It's quiet down here. Say something to the others who fell."
                  onSend={sendChat('ghost')}
                  height={240}
                />
              )}
            </div>

            <aside className="col-lg-4 d-flex flex-column gap-4">
              {/* Role */}
              <section className="card glass-panel rounded-4 p-4" style={{ borderColor: getRoleColor(role) }} aria-labelledby="role-heading">
                <div className="d-flex align-items-center gap-3">
                  {role && getRoleIcon(role)
                    ? <img src={getRoleIcon(role)} alt="" style={{ width: 64, height: 64, objectFit: 'contain', filter: 'drop-shadow(0 0 10px var(--accent-gold-glow))' }} />
                    : role === 'Detective'
                      ? <span className="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0" style={{ width: 64, height: 64, border: '1px solid var(--role-detective)', background: 'rgba(91, 141, 239, 0.12)' }}><Search size={28} color="var(--role-detective)" /></span>
                      : <PersonCircle size={56} style={muted} />}
                  <div style={{ minWidth: 0 }}>
                    <span className="small d-block" style={{ ...muted, letterSpacing: '2px' }}>YOUR ROLE</span>
                    <h2 id="role-heading" className="h4 fw-bold mb-0" style={{ color: role === 'Mafia' ? '#ff6b6b' : getRoleColor(role), letterSpacing: '3px' }}>{role || 'Pending…'}</h2>
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
                {role === 'Detective' && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(91, 141, 239, 0.35)' }}>
                    <span className="small d-block mb-2" style={{ ...muted, letterSpacing: '2px' }}>CASE NOTES</span>
                    {investigations.length === 0 ? (
                      <p className="small mb-0" style={muted}>No investigations yet. Your first one comes at night.</p>
                    ) : (
                      <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                        {investigations.map(finding => {
                          const suspect = players.find(p => p.userId === finding.userId);
                          return (
                            <li key={finding.night} className="d-flex align-items-center gap-2">
                              <Avatar image={suspect?.avatar} name={finding.username} size={28} />
                              <span className="small flex-grow-1 text-truncate" style={{ color: 'var(--text-primary)' }}>
                                {finding.username}
                                <span className="d-block" style={{ ...muted, fontSize: '0.7rem' }}>Night {finding.night}</span>
                              </span>
                              <span
                                className="badge rounded-pill"
                                style={finding.isMafia
                                  ? { background: 'var(--role-mafia)', color: '#fff' }
                                  : { border: '1px solid var(--role-medic)', color: '#7fd1a4' }}
                              >
                                {finding.isMafia ? 'MAFIA' : 'NOT MAFIA'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="small mb-0 mt-2" style={muted}>Only you can see this.</p>
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
                        {!player.isAlive
                          ? (player.revealedRole ? `OUT · ${player.revealedRole.toUpperCase()}` : 'OUT')
                          : player.disconnected ? 'OFFLINE' : 'ALIVE'}
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
