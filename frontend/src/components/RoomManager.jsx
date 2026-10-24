import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { authClient } from '../authClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusCircle,
  People,
  Key,
  ExclamationTriangleFill,
  BoxArrowRight,
  GearFill
} from 'react-bootstrap-icons';
import Notification from './Notification';
import Avatar from './Avatar';

const muted = { color: 'var(--text-secondary)' };

const RoomManager = ({ username, user, onRoomJoined, onOpenSettings, reconnectError }) => {
  const [roomCode, setRoomCode] = useState(localStorage.getItem('mafia-room-code') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/me/stats', { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    const handleRoomCreated = ({ roomCode, players }) => {
      setIsLoading(false);
      onRoomJoined(roomCode, players);
    };

    const handleRoomJoinedEvent = ({ roomCode, players }) => {
      setIsLoading(false);
      onRoomJoined(roomCode, players);
    };

    const handleError = (msg) => {
      setIsLoading(false);
      setNotification({ message: msg, type: 'error' });
    };

    // A rejected connection (e.g. expired session) would otherwise leave the buttons spinning
    const handleConnectError = () => {
      if (!socket.active) setIsLoading(false);
    };

    socket.on('room_created', handleRoomCreated);
    socket.on('room_joined', handleRoomJoinedEvent);
    socket.on('error', handleError);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect_error', handleConnectError);
      socket.off('room_created', handleRoomCreated);
      socket.off('room_joined', handleRoomJoinedEvent);
      socket.off('error', handleError);
    };
  }, [onRoomJoined]);

  const handleCreateRoom = () => {
    setNotification(null);
    setIsLoading(true);
    socket.connect();
    socket.emit('create_room');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!roomCode) return setNotification({ message: 'Enter a valid frequency code', type: 'error' });
    setNotification(null);
    setIsLoading(true);
    socket.connect();
    socket.emit('join_room', { roomCode });
  };

  const handleSignOut = async () => {
    if (window.confirm("Are you sure you want to exit the underground?")) {
      const { error } = await authClient.signOut();
      if (error) setNotification({ message: error.message, type: 'error' });
      else {
        localStorage.removeItem('mafia-room-code');
        window.location.reload();
      }
    }
  };

  const levelProgress = stats ? Math.round((stats.xpIntoLevel / stats.xpPerLevel) * 100) : 0;

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ background: 'var(--bg-primary)' }}>
      <AnimatePresence>
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </AnimatePresence>

      <header style={{ borderBottom: '1px solid rgba(200, 169, 107, 0.15)' }}>
        <div className="container d-flex align-items-center justify-content-between gap-3 py-3 px-3" style={{ maxWidth: '72rem' }}>
          <span className="gold-text text-nowrap d-none d-sm-inline" style={{ fontFamily: 'var(--font-title)', letterSpacing: '4px', fontWeight: 700 }}>
            MAFIA
          </span>

          <div className="d-flex align-items-center gap-2 ms-auto" style={{ minWidth: 0 }}>
            <button type="button" className="profile-chip" onClick={onOpenSettings} aria-label="Open your dossier">
              <Avatar image={user.image} name={username} size={40} />
              <span className="d-flex flex-column" style={{ minWidth: 0 }}>
                <span className="fw-semibold text-truncate" style={{ maxWidth: '12rem', color: 'var(--text-primary)' }}>{username}</span>
                {stats ? (
                  <>
                    <span className="small text-nowrap gold-text" style={{ fontSize: '0.72rem', letterSpacing: '1px' }}>
                      LV {stats.level} · {stats.rank.toUpperCase()}
                    </span>
                    <span className="d-block mt-1 rounded-pill overflow-hidden" style={{ height: '3px', width: '100%', background: 'rgba(255,255,255,0.08)' }} aria-hidden="true">
                      <span className="d-block h-100" style={{ width: `${levelProgress}%`, background: 'var(--accent-gold)' }} />
                    </span>
                  </>
                ) : (
                  <span className="small" style={{ ...muted, fontSize: '0.72rem' }}>Loading rank…</span>
                )}
              </span>
            </button>
            <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
              <GearFill size={18} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
              <BoxArrowRight size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow-1 d-flex align-items-center py-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="container px-3"
          style={{ maxWidth: '56rem' }}
        >
          <div className="text-center mb-5">
            <h1 className="fw-bold gold-text mb-2" style={{ letterSpacing: '6px', fontSize: 'clamp(2rem, 6vw, 3.25rem)' }}>COMMAND CENTER</h1>
            <p className="mb-0" style={muted}>Host a new game or join your crew with their frequency code.</p>
          </div>

          <AnimatePresence>
            {reconnectError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="alert rounded-4 mb-4 d-flex align-items-center"
                role="alert"
                style={{ background: 'rgba(139, 0, 0, 0.12)', border: '1px solid var(--role-mafia)', color: '#ffbaba' }}
              >
                <ExclamationTriangleFill className="me-3 fs-4 flex-shrink-0" />
                <div>
                  <div className="fw-bold" style={{ fontFamily: 'var(--font-title)' }}>SIGNAL LOST</div>
                  <small style={{ fontSize: '0.85rem' }}>{reconnectError} Re-enter the room manually.</small>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="row g-4">
            <div className="col-md-6">
              <section className="action-card card glass-panel h-100 p-4 p-lg-5 rounded-4" aria-labelledby="host-heading">
                <span className="d-inline-flex align-items-center justify-content-center rounded-3 mb-4" style={{ width: 48, height: 48, background: 'rgba(200, 169, 107, 0.1)', border: '1px solid rgba(200, 169, 107, 0.3)' }}>
                  <PlusCircle size={22} className="gold-text" />
                </span>
                <h2 id="host-heading" className="h5 fw-bold gold-text mb-2">Host a game</h2>
                <p className="mb-4 flex-grow-1" style={muted}>
                  Start a new operation as the commander. Share the code with 3–9 friends to begin.
                </p>
                <button
                  className="btn btn-gold btn-lg w-100 py-3 rounded-3 d-flex align-items-center justify-content-center"
                  onClick={handleCreateRoom}
                  disabled={isLoading}
                >
                  {isLoading ? <span className="spinner-border spinner-border-sm me-2" role="status" /> : <PlusCircle className="me-2" />}
                  {isLoading ? 'Establishing…' : 'Establish operation'}
                </button>
              </section>
            </div>

            <div className="col-md-6">
              <section className="action-card card glass-panel h-100 p-4 p-lg-5 rounded-4" aria-labelledby="join-heading">
                <span className="d-inline-flex align-items-center justify-content-center rounded-3 mb-4" style={{ width: 48, height: 48, background: 'rgba(200, 169, 107, 0.1)', border: '1px solid rgba(200, 169, 107, 0.3)' }}>
                  <Key size={22} className="gold-text" />
                </span>
                <h2 id="join-heading" className="h5 fw-bold gold-text mb-2">Join a game</h2>
                <p className="mb-4" style={muted}>Got a frequency code from the host? Enter it below.</p>
                <form onSubmit={handleJoinRoom} className="mt-auto">
                  <label htmlFor="room-code" className="visually-hidden">Room code</label>
                  <input
                    id="room-code"
                    type="text"
                    className="form-control form-control-lg text-center mb-3 rounded-3"
                    placeholder="ENTER CODE"
                    value={roomCode}
                    disabled={isLoading}
                    maxLength={6}
                    autoComplete="off"
                    style={{
                      textTransform: 'uppercase',
                      letterSpacing: '6px',
                      background: '#000',
                      fontWeight: 'bold',
                      fontSize: '1.4rem'
                    }}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  />
                  <button type="submit" className="btn btn-gold btn-lg w-100 py-3 rounded-3 d-flex align-items-center justify-content-center" disabled={isLoading || !roomCode}>
                    {isLoading ? <span className="spinner-border spinner-border-sm me-2" role="status" /> : <People className="me-2" />}
                    {isLoading ? 'Connecting…' : 'Join'}
                  </button>
                </form>
              </section>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default RoomManager;
