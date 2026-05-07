import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { PersonFill, StarFill, PlayFill, DoorOpenFill, PeopleFill, WifiOff } from 'react-bootstrap-icons';

const Lobby = ({ roomCode, initialPlayers, username }) => {
  const [players, setPlayers] = useState(initialPlayers);

  useEffect(() => {
    const onPlayersUpdate = ({ players }) => setPlayers(players);
    socket.on('player_joined', onPlayersUpdate);
    socket.on('player_left', onPlayersUpdate);

    return () => {
      socket.off('player_joined', onPlayersUpdate);
      socket.off('player_left', onPlayersUpdate);
    };
  }, []);

  const isHost = players.find(p => p.username === username)?.isHost;

  const handleLeave = () => {
      const userId = localStorage.getItem('mafia-user-id'); // We'll set this in App.jsx
      socket.emit('leave_room_explicitly', { roomCode, userId });
      localStorage.removeItem('mafia-room-code');
      window.location.reload();
  };

  return (
    <div className="container-fluid min-vh-100 py-5" style={{ background: 'var(--bg-primary)' }}>
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card glass-panel shadow-lg gold-border" 
            style={{ borderRadius: '25px' }}
          >
            <div className="card-header p-5 border-0 d-flex justify-content-between align-items-center" style={{ background: 'rgba(200, 169, 107, 0.05)', borderRadius: '25px 25px 0 0' }}>
              <div>
                <span className="small d-block text-uppercase gold-text" style={{ letterSpacing: '2px', opacity: 0.7 }}>Secure Frequency</span>
                <h2 className="mb-0 fw-bold gold-text" style={{ letterSpacing: '8px', fontSize: '2.5rem' }}>{roomCode}</h2>
              </div>
              <div className="text-end">
                <PeopleFill size={24} className="gold-text mb-2" />
                <div className="fs-3 fw-bold gold-text">{players.length}<span style={{ opacity: 0.3, fontSize: '1rem' }}>/10</span></div>
              </div>
            </div>
            
            <div className="card-body p-5">
              <h5 className="mb-4 gold-text" style={{ fontSize: '0.9rem', letterSpacing: '2px' }}>THE CONSPIRATORS</h5>
              <div className="list-group list-group-flush">
                <AnimatePresence>
                  {players.map((player) => (
                    <motion.div 
                      key={player.userId}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="list-group-item d-flex justify-content-between align-items-center py-3 px-0 bg-transparent"
                    >
                      <div className="d-flex align-items-center">
                        <div 
                          className={`p-2 rounded-circle me-4 d-flex align-items-center justify-content-center ${player.isHost ? 'gold-glow' : ''}`}
                          style={{ 
                            border: `1px solid ${player.isHost ? 'var(--accent-gold)' : 'var(--text-secondary)'}`,
                            background: player.isHost ? 'var(--accent-gold)' : 'transparent'
                          }}
                        >
                          {player.isHost ? <StarFill size={18} color="black" /> : <PersonFill size={18} className="text-secondary" />}
                        </div>
                        <div>
                          <span 
                            className={`h5 mb-0 d-block ${player.username === username ? 'gold-text fw-bold' : 'text-primary'}`}
                            style={{ fontFamily: 'var(--font-ui)', letterSpacing: '1px' }}
                          >
                            {player.username} {player.username === username && '(YOU)'}
                          </span>
                          {player.disconnected && (
                            <small className="text-danger pulse-red d-block mt-1" style={{ fontSize: '0.7rem' }}>
                              <WifiOff size={10} className="me-1"/> SIGNAL WEAK / RECONNECTING...
                            </small>
                          )}
                        </div>
                      </div>
                      {player.isHost && <span className="small gold-text fw-bold" style={{ letterSpacing: '2px', fontSize: '0.7rem' }}>COMMANDER</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="card-footer p-5 border-0 bg-transparent">
              {isHost ? (
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn btn-gold btn-lg w-100 py-4 shadow-lg pulse-gold" 
                  disabled={players.length < 4}
                  onClick={() => socket.emit('start_game', { roomCode })}
                  style={{ fontSize: '1.2rem' }}
                >
                  <PlayFill size={28} className="me-2" />
                  {players.length < 4 ? `WAITING FOR ${4 - players.length} RECRUITS` : 'INITIATE OPERATION'}
                </motion.button>
              ) : (
                <div className="text-center py-4 glass-panel gold-border">
                  <div className="spinner-border text-warning me-3" role="status" style={{ borderRightColor: 'transparent' }}></div>
                  <span className="gold-text fw-bold" style={{ letterSpacing: '2px' }}>AWAITING COMMANDS...</span>
                </div>
              )}
              <button 
                className="btn btn-link btn-sm w-100 text-secondary mt-4 text-decoration-none fw-bold" 
                onClick={handleLeave}
                style={{ letterSpacing: '1px' }}
              >
                <DoorOpenFill className="me-2" /> ABANDON MISSION
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
