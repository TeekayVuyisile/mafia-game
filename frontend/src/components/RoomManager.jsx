import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PlusCircle, 
  People, 
  Key, 
  ExclamationTriangleFill, 
  PencilSquare, 
  CheckCircleFill, 
  XCircleFill, 
  BoxArrowRight 
} from 'react-bootstrap-icons';

const RoomManager = ({ username, userId, onRoomJoined, reconnectError }) => {
  const [roomCode, setRoomCode] = useState(localStorage.getItem('mafia-room-code') || '');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(username);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handleRoomCreated = ({ roomCode, players }) => {
      onRoomJoined(roomCode, players);
    };

    const handleRoomJoinedEvent = ({ roomCode, players }) => {
      onRoomJoined(roomCode, players);
    };

    const handleError = (msg) => {
      alert(msg);
    };

    socket.on('room_created', handleRoomCreated);
    socket.on('room_joined', handleRoomJoinedEvent);
    socket.on('error', handleError);

    return () => {
      socket.off('room_created', handleRoomCreated);
      socket.off('room_joined', handleRoomJoinedEvent);
      socket.off('error', handleError);
    };
  }, [onRoomJoined]);

  const handleCreateRoom = () => {
    socket.connect();
    socket.emit('create_room', { username, userId });
  };

  const handleJoinRoom = () => {
    if (!roomCode) return alert('Enter a room code');
    socket.connect();
    socket.emit('join_room', { roomCode, username, userId });
  };

  const handleUpdateUsername = async () => {
    if (!newUsername.trim()) return alert("Username cannot be empty");
    setIsUpdating(true);
    const { error } = await supabase.auth.updateUser({
      data: { username: newUsername.trim() }
    });
    
    if (error) {
      alert(error.message);
    } else {
      setIsEditingUsername(false);
    }
    setIsUpdating(false);
  };

  const handleSignOut = async () => {
    if (window.confirm("Are you sure you want to exit the underground?")) {
      const { error } = await supabase.auth.signOut();
      if (error) alert(error.message);
      else {
        localStorage.removeItem('mafia-room-code');
        localStorage.removeItem('mafia-user-id');
        window.location.reload();
      }
    }
  };

  return (
    <div className="container-fluid min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--bg-primary)' }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="row w-100 justify-content-center"
      >
        <div className="col-md-6 col-lg-5">
          <div className="text-center mb-5">
            <h1 className="display-4 fw-bold gold-text" style={{ letterSpacing: '6px' }}>COMMAND CENTER</h1>
            
            <div className="d-flex align-items-center justify-content-center mt-3 gap-3">
              {isEditingUsername ? (
                <div className="input-group input-group-sm" style={{ maxWidth: '300px' }}>
                  <input 
                    type="text" 
                    className="form-control bg-dark border-gold text-white" 
                    value={newUsername} 
                    onChange={(e) => setNewUsername(e.target.value)}
                    autoFocus
                  />
                  <button className="btn btn-gold" onClick={handleUpdateUsername} disabled={isUpdating}>
                    {isUpdating ? <span className="spinner-border spinner-border-sm"></span> : <CheckCircleFill />}
                  </button>
                  <button className="btn btn-outline-danger" onClick={() => { setIsEditingUsername(false); setNewUsername(username); }}>
                    <XCircleFill />
                  </button>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>
                  Logged in as <strong className="gold-text">{username}</strong>
                  <button 
                    className="btn btn-link btn-sm gold-text p-0 ms-2" 
                    onClick={() => setIsEditingUsername(true)}
                    title="Change Username"
                  >
                    <PencilSquare />
                  </button>
                </p>
              )}
            </div>
          </div>

          <AnimatePresence>
            {reconnectError && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="alert border-0 shadow-lg mb-5 d-flex align-items-center pulse-red"
                style={{ background: 'rgba(139, 0, 0, 0.1)', border: '1px solid var(--role-mafia)', color: '#ffbaba' }}
              >
                <ExclamationTriangleFill className="me-3 fs-3" />
                <div>
                  <div className="fw-bold" style={{ fontFamily: 'var(--font-title)' }}>SIGNAL LOST</div>
                  <small style={{ fontSize: '0.8rem' }}>{reconnectError} Re-enter the room manually.</small>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="row g-4">
            <div className="col-12">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-gold btn-lg w-100 py-4 shadow-lg d-flex align-items-center justify-content-center rounded-4" 
                onClick={handleCreateRoom}
                style={{ border: '2px solid var(--accent-gold)' }}
              >
                <PlusCircle size={30} className="me-4" />
                <div className="text-start">
                  <div className="fw-bold h5 mb-0">ESTABLISH OPERATION</div>
                  <div className="small opacity-75" style={{ textTransform: 'none', letterSpacing: '0' }}>Begin a new game as the mastermind</div>
                </div>
              </motion.button>
            </div>

            <div className="col-12">
              <div className="card glass-panel p-4 gold-border">
                <div className="d-flex align-items-center mb-4">
                  <Key size={24} className="me-3 gold-text" />
                  <h5 className="mb-0 fw-bold gold-text">INTERCEPT FREQUENCY</h5>
                </div>
                <div className="input-group input-group-lg">
                  <input
                    type="text"
                    className="form-control border-2 text-center"
                    placeholder="ENTER CODE"
                    value={roomCode}
                    style={{ 
                      textTransform: 'uppercase', 
                      letterSpacing: '4px', 
                      background: '#000', 
                      fontWeight: 'bold',
                      fontSize: '1.5rem'
                    }}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  />
                  <button className="btn btn-gold px-5 fw-bold" onClick={handleJoinRoom}>
                    <People className="me-2" /> JOIN
                  </button>
                </div>
              </div>
            </div>

            <div className="col-12 text-center mt-5">
              <button 
                className="btn btn-link text-secondary text-decoration-none fw-bold" 
                style={{ letterSpacing: '2px', fontSize: '0.8rem' }}
                onClick={handleSignOut}
              >
                <BoxArrowRight className="me-2" /> DISCONNECT FROM THE UNDERGROUND
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RoomManager;
