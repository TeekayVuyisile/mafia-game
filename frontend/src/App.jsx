import { useState, useEffect, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import Auth from './components/Auth';
import RoomManager from './components/RoomManager';
import Lobby from './components/Lobby';
import Game from './components/Game';
import LandingPage from './components/LandingPage';
import Notification from './components/Notification';
import Settings from './components/Settings';
import { authClient } from './authClient';
import { socket } from './socket';
import { AnimatePresence } from 'framer-motion';

function App() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [showAuth, setShowAuth] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  // State the Game screen mounts into: a game_started payload or a room_reconnected sync
  const [gameSnapshot, setGameSnapshot] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const reconnectTimeout = useRef(null);
  const roomCodeRef = useRef(null);

  useEffect(() => {
    roomCodeRef.current = roomData?.code ?? null;
  }, [roomData]);

  useEffect(() => {
    // 1. All Listeners defined once
    const onGameStarted = (data) => {
      const { players, settings } = data;
      setGameSnapshot(data);
      const code = localStorage.getItem('mafia-room-code');
      if (players) setRoomData(prev => prev ? { ...prev, players, settings: settings ?? prev.settings } : { code: code || 'UNKNOWN', players, settings });
      setGameStarted(true);
    };

    const onRoomRestarted = ({ players, settings }) => {
      setRoomData(prev => prev ? { ...prev, players, settings: settings ?? prev.settings } : null);
      setGameStarted(false);
      setGameSnapshot(null);
    };

    const onRoomTerminated = ({ message }) => {
      setNotification({ message, type: 'info' });
      setTimeout(() => {
        localStorage.removeItem('mafia-room-code');
        window.location.reload();
      }, 3000);
    };

    const onRoomReconnected = (data) => {
        console.log("DEBUG App: Reconnect Event Received", data);
        clearTimeout(reconnectTimeout.current);
        localStorage.setItem('mafia-room-code', data.roomCode);
        setRoomData({ code: data.roomCode, players: data.players, settings: data.settings });
        setGameSnapshot(data);
        // Also covers a restart that happened while we were away (back to Lobby)
        setGameStarted(data.gameState !== 'Lobby');
        setReconnecting(false);
        setReconnectError(null);
    };

    const onError = (msg) => {
        console.log("DEBUG App: Socket Error", msg);
        // CRITICAL: Stop the loop by clearing the invalid data
        localStorage.removeItem('mafia-room-code');
        setReconnectError(`Reconnection failed: ${msg}`);
        setReconnecting(false);
        clearTimeout(reconnectTimeout.current);
        // The room vanished while we were in it (e.g. server restart): fall back to the room picker
        if (roomCodeRef.current) {
            setRoomData(null);
            setGameStarted(false);
            setGameSnapshot(null);
        }
    };

    const onPlayersUpdate = ({ players }) => {
        setRoomData(prev => prev ? { ...prev, players } : null);
    };

    const onSettingsUpdated = ({ settings }) => {
        setRoomData(prev => prev ? { ...prev, settings } : prev);
    };

    const onKicked = ({ message }) => {
        localStorage.removeItem('mafia-room-code');
        setRoomData(null);
        setGameStarted(false);
        setGameSnapshot(null);
        setNotification({ message, type: 'error' });
    };

    const onHostChanged = ({ message }) => {
        setNotification({ message, type: 'info' });
    };

    // Socket.io reconnects with a new socket id that the server doesn't know yet;
    // re-identify so we rejoin the room and receive a full state sync
    const onConnect = () => {
        if (roomCodeRef.current) {
            socket.emit('reconnect_user', { roomCode: roomCodeRef.current });
        }
    };

    // Middleware rejections (e.g. expired session) aren't retried automatically by Socket.io
    const onConnectError = (err) => {
        if (socket.active) return;
        console.log("DEBUG App: Socket rejected", err.message);
        clearTimeout(reconnectTimeout.current);
        setReconnecting(false);
        setReconnectError(err.message === 'unauthorized'
            ? 'Your session expired. Sign out and sign back in.'
            : `Could not reach the server: ${err.message}`);
    };

    // 2. Attach Listeners
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('game_started', onGameStarted);
    socket.on('room_restarted', onRoomRestarted);
    socket.on('room_terminated', onRoomTerminated);
    socket.on('room_reconnected', onRoomReconnected);
    socket.on('player_joined', onPlayersUpdate);
    socket.on('player_left', onPlayersUpdate);
    socket.on('error', onError);
    socket.on('settings_updated', onSettingsUpdated);
    socket.on('kicked', onKicked);
    socket.on('host_changed', onHostChanged);

    // 3. Initial Handshake Logic (Runs ONCE)
    authClient.getSession().then(({ data: session }) => {
      if (session) {
          const savedRoomCode = localStorage.getItem('mafia-room-code');
          if (savedRoomCode) {
              console.log("DEBUG App: Mount - Attempting Reconnect to", savedRoomCode);
              setReconnecting(true);
              socket.connect();
              socket.emit('reconnect_user', { roomCode: savedRoomCode });
              
              reconnectTimeout.current = setTimeout(() => {
                  setReconnectError("Reconnection timed out.");
                  setReconnecting(false);
                  // Preserve room code for manual rejoin
              }, 8000);
          }
      }
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('game_started', onGameStarted);
      socket.off('room_restarted', onRoomRestarted);
      socket.off('room_terminated', onRoomTerminated);
      socket.off('room_reconnected', onRoomReconnected);
      socket.off('player_joined', onPlayersUpdate);
      socket.off('player_left', onPlayersUpdate);
      socket.off('error', onError);
      socket.off('settings_updated', onSettingsUpdated);
      socket.off('kicked', onKicked);
      socket.off('host_changed', onHostChanged);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []); // EMPTY ARRAY: Run once on mount ONLY

  const handleRoomJoined = (code, players, settings) => {
    localStorage.setItem('mafia-room-code', code);
    setRoomData({ code, players, settings });
    setReconnectError(null);
  };

  const username = session?.user?.name || session?.user?.email?.split('@')[0] || 'Player';

  if (sessionPending) {
      return <div className="min-vh-100" style={{ background: 'var(--bg-primary)' }} />;
  }

  if (reconnecting) {
      return (
          <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-center glass-panel p-5 gold-border" style={{ borderRadius: '25px' }}>
                  <div className="spinner-border gold-text mb-4" style={{width: '4rem', height: '4rem', borderRightColor: 'transparent'}} role="status"></div>
                  <h2 className="fw-bold gold-text" style={{ letterSpacing: '4px' }}>RESTORING SIGNAL...</h2>
                  <p className="text-secondary small text-uppercase" style={{ letterSpacing: '1px' }}>Authenticating your frequency</p>
                  <button className="btn btn-link text-secondary text-decoration-none mt-4 fw-bold" onClick={() => {
                      setReconnecting(false);
                      localStorage.removeItem('mafia-room-code');
                  }}>ABANDON RECOVERY</button>
              </div>
          </div>
      );
  }

  return (
    <div className="App">
      <AnimatePresence>
        {notification && (
          <Notification 
            message={notification.message} 
            type={notification.type} 
            onClose={() => setNotification(null)} 
          />
        )}
      </AnimatePresence>
      {!session ? (
        showAuth ? <Auth /> : <LandingPage onEnter={() => setShowAuth(true)} />
      ) : gameStarted && roomData ? (
        <Game 
          roomCode={roomData.code} 
          userId={session.user.id}
          snapshot={gameSnapshot || { gameState: 'RoleAssignment', players: roomData.players }}
        />
      ) : !roomData && showSettings ? (
        <Settings user={session.user} onClose={() => setShowSettings(false)} />
      ) : !roomData ? (
        <RoomManager 
            username={username} 
            user={session.user}
            onRoomJoined={handleRoomJoined} 
            onOpenSettings={() => setShowSettings(true)}
            reconnectError={reconnectError}
        />
      ) : (
        <Lobby roomCode={roomData.code} initialPlayers={roomData.players} settings={roomData.settings} userId={session.user.id} />
      )}
    </div>
  );
}

export default App;
