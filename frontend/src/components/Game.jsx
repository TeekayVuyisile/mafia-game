import React, { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';
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
  ExclamationTriangleFill
} from 'react-bootstrap-icons';

const Game = ({ roomCode, username, initialGameState, initialSubPhase, initialMessage, initialRole, initialPlayers }) => {
  console.log("DEBUG Game: Component Mounted", { initialGameState, initialSubPhase, initialMessage });
  
  const [role, setRole] = useState(initialRole);
  const [gameState, setGameState] = useState(initialGameState);
  const [subPhase, setSubPhase] = useState(initialSubPhase); 
  const [timer, setTimer] = useState(null);
  const [message, setMessage] = useState(initialMessage || (initialRole ? `You are a ${initialRole}` : 'Wait for your role...'));
  const [players, setPlayers] = useState(initialPlayers || []);
  const [chat, setChat] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [voteTally, setVoteTally] = useState({});
  const [winnerData, setWinnerData] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const chatEndRef = useRef(null);
  
  const lastSpoken = useRef("");
  const resumeTimeout = useRef(null);
  const currentUtterance = useRef(null);

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return;
    if (!text || text === lastSpoken.current) return;

    // Clear existing heartbeat and utterance
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    window.speechSynthesis.cancel();

    // Use a slight delay before speaking to ensure 'cancel' has cleared the buffer
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // PERSIST THE UTTERANCE to prevent Garbage Collection (common Chrome bug)
      currentUtterance.current = utterance;

      const resumeHeartbeat = () => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
        resumeTimeout.current = setTimeout(resumeHeartbeat, 10000); // Heartbeat every 10s
      };

      utterance.onstart = () => {
        resumeHeartbeat();
      };

      utterance.onend = () => {
        if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
        currentUtterance.current = null;
      };

      utterance.onerror = (event) => {
        console.error("SpeechSynthesis Error:", event);
        if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
        currentUtterance.current = null;
      };

      lastSpoken.current = text;
      window.speechSynthesis.speak(utterance);
    }, 100);
  };

  useEffect(() => {
    if (initialRole && !role) {
      setRole(initialRole);
    }
  }, [initialRole]);

  useEffect(() => {
    // Narrate state on mount if it's a reconnection
    if (initialMessage && !lastSpoken.current) {
        speak(initialMessage);
    } else if (role && !lastSpoken.current) {
        speak(`Your role has been assigned. Check your secret identity.`);
    }

    const handlePhaseChange = ({ gameState, subPhase, message, timer, players }) => {
      lastSpoken.current = ""; 
      setGameState(gameState);
      setSubPhase(subPhase);
      setMessage(message);
      setTimer(timer);
      setSelectedTarget(null);
      if (players) setPlayers(players);
      if (gameState !== 'Voting') setVoteTally({});
      speak(message);
    };

    const handleReceiveMessage = (msg) => setChat(prev => [...prev, msg]);
    const handleActionConfirmed = ({ message }) => setMessage(message);
    const handleVoteUpdate = ({ tally }) => setVoteTally(tally);
    const handleGameOver = (data) => {
      setGameState('GameOver');
      setWinnerData(data);
      speak(`Game Over. ${data.winner} victory!`);
    };

    socket.on('phase_change', handlePhaseChange);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('action_confirmed', handleActionConfirmed);
    socket.on('vote_update', handleVoteUpdate);
    socket.on('game_over', handleGameOver);

    return () => {
      socket.off('phase_change', handlePhaseChange);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('action_confirmed', handleActionConfirmed);
      socket.off('vote_update', handleVoteUpdate);
      socket.off('game_over');
      if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    };
  }, [role]); 

  useEffect(() => {
    if (timer === null || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

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
      socket.emit('leave_room_explicitly', { roomCode, userId: players.find(p => p.username === username)?.userId });
      localStorage.removeItem('mafia-room-code');
      window.location.reload();
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    socket.emit('send_message', { roomCode, message: inputMessage });
    setInputMessage('');
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

  const isAlive = players.find(p => p.username === username)?.isAlive ?? true;
  const isHost = players.find(p => p.username === username)?.isHost;

  if (gameState === 'GameOver' && winnerData) {
    return (
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="container min-vh-100 d-flex align-items-center justify-content-center py-5"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="card shadow-lg border-0 glass-panel overflow-hidden gold-border" style={{ width: '100%', maxWidth: '800px', borderRadius: '30px' }}>
          <div className={`p-5 text-center ${winnerData.winner === 'Mafia' ? 'pulse-red' : 'gold-glow'}`} style={{ background: winnerData.winner === 'Mafia' ? 'rgba(139, 0, 0, 0.2)' : 'rgba(200, 169, 107, 0.1)' }}>
            <h1 className="display-3 fw-bold mb-0 gold-text" style={{ letterSpacing: '10px' }}>{(winnerData.winner || 'GAME').toUpperCase()} VICTORIOUS</h1>
          </div>
          <div className="card-body p-5">
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
                      {players.filter(p => p.isAlive && (role === 'Medic' || p.username !== username)).map(player => (
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
                      {players.filter(p => p.isAlive && p.username !== username).map(player => (
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
                  <div className="glass-panel p-4 mb-3" style={{ height: '350px', overflowY: 'auto', border: '1px solid rgba(200, 169, 107, 0.1)' }}>
                    {chat.map((msg, idx) => (
                      <div key={idx} className={`mb-4 d-flex flex-column ${msg.username === username ? 'align-items-end' : 'align-items-start'}`}>
                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', letterSpacing: '1px' }}>{msg.username.toUpperCase()} • {msg.timestamp}</small>
                        <div className={`p-3 rounded-4 mt-2 ${msg.username === username ? 'gold-border' : ''}`} 
                             style={{ 
                               maxWidth: '80%', 
                               background: msg.username === username ? 'rgba(200, 169, 107, 0.1)' : 'rgba(255,255,255,0.05)',
                               fontSize: '0.95rem'
                             }}>
                          {msg.message}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  {isAlive && (
                    <form onSubmit={handleSendMessage} className="d-flex gap-2">
                      <input
                        type="text"
                        className="form-control form-control-lg rounded-pill px-4"
                        placeholder="SEND A CODED MESSAGE..."
                        value={inputMessage}
                        style={{ fontSize: '0.9rem', letterSpacing: '1px' }}
                        onChange={(e) => setInputMessage(e.target.value)}
                      />
                      <button type="submit" className="btn btn-gold rounded-circle p-3 d-flex align-items-center justify-content-center">
                        <SendFill size={20} />
                      </button>
                    </form>
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
                        {player.username} {player.username === username && <span className="gold-text ms-2">(YOU)</span>}
                      </span>
                    </div>
                    {player.isAlive ? (
                      <span className="small gold-text fw-bold" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>ACTIVE</span>
                    ) : (
                      <span className="small text-danger fw-bold" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>ELIMINATED</span>
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
