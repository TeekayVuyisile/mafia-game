import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { motion, AnimatePresence } from 'framer-motion';
import { StarFill, PlayFill, BoxArrowLeft, WifiOff, Clipboard, ClipboardCheck, PersonPlus, XLg, Sliders } from 'react-bootstrap-icons';
import Avatar from './Avatar';
import TopBar from './TopBar';

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;
const muted = { color: 'var(--text-secondary)' };

// Mirrors the options the server accepts in `update_settings`
const DISCUSSION_OPTIONS = [30, 60, 90, 120, 180].map(s => ({ value: s, label: s < 120 ? `${s}s` : `${s / 60}m` }));
const VOTING_OPTIONS = [15, 30, 45, 60].map(s => ({ value: s, label: `${s}s` }));
const VISIBILITY_OPTIONS = [{ value: 'anonymous', label: 'Anonymous' }, { value: 'public', label: 'Public' }];
const REVEAL_OPTIONS = [{ value: false, label: 'Hidden' }, { value: true, label: 'Revealed' }];
const DETECTIVE_OPTIONS = [{ value: false, label: 'Off' }, { value: true, label: 'On' }];
const DETECTIVE_MIN_PLAYERS = 6;
const DEFAULT_SETTINGS = { discussionTime: 60, votingTime: 30, voteVisibility: 'anonymous', revealRoleOnDeath: false, detective: false };

const Segmented = ({ id, label, hint, options, value, onChange, disabled }) => (
  <div className="mb-3">
    <div id={id} className="small fw-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{label}</div>
    {hint && <div className="small mb-2" style={{ ...muted, fontSize: '0.78rem' }}>{hint}</div>}
    <div className="d-flex flex-wrap gap-1" role="radiogroup" aria-labelledby={id}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => !selected && onChange(option.value)}
            className="btn btn-sm rounded-pill px-3"
            style={{
              minHeight: 36,
              border: `1px solid ${selected ? 'var(--accent-gold)' : 'rgba(200, 169, 107, 0.2)'}`,
              background: selected ? 'rgba(200, 169, 107, 0.18)' : 'transparent',
              color: selected ? 'var(--accent-gold)' : 'var(--text-secondary)',
              opacity: 1
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </div>
);

const Lobby = ({ roomCode, initialPlayers, settings: roomSettings, userId }) => {
  const [players, setPlayers] = useState(initialPlayers);
  const [copied, setCopied] = useState(false);
  const settings = { ...DEFAULT_SETTINGS, ...roomSettings };

  useEffect(() => {
    const onPlayersUpdate = ({ players }) => setPlayers(players);
    socket.on('player_joined', onPlayersUpdate);
    socket.on('player_left', onPlayersUpdate);

    return () => {
      socket.off('player_joined', onPlayersUpdate);
      socket.off('player_left', onPlayersUpdate);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const isHost = players.find(p => p.userId === userId)?.isHost;
  const missing = Math.max(0, MIN_PLAYERS - players.length);
  const mafiaCount = players.length >= 7 ? 2 : 1;
  const detectiveAllowed = players.length >= DETECTIVE_MIN_PLAYERS;
  const detectiveCount = settings.detective && detectiveAllowed ? 1 : 0;
  const detectiveHint = !detectiveAllowed
    ? `Needs ${DETECTIVE_MIN_PLAYERS}+ players${settings.detective ? ', so it will be left out for now' : ''}.`
    : settings.detective ? 'Investigates one player each night.' : 'Off: no Detective this game.';

  const handleLeave = () => {
      socket.emit('leave_room_explicitly', { roomCode });
      localStorage.removeItem('mafia-room-code');
      window.location.reload();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); the code is still visible to read out
    }
  };

  const updateSetting = (key) => (value) => socket.emit('update_settings', { roomCode, settings: { [key]: value } });

  const handleKick = (player) => {
    if (window.confirm(`Remove ${player.username} from the room? They won't be able to rejoin it.`)) {
      socket.emit('kick_player', { roomCode, targetUserId: player.userId });
    }
  };

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ background: 'var(--bg-primary)' }}>
      <TopBar>
        <span className="small text-nowrap px-3 py-2 rounded-pill" style={{ border: '1px solid rgba(200, 169, 107, 0.25)', color: 'var(--text-secondary)', letterSpacing: '1px' }}>
          ROOM <span className="gold-text fw-bold ms-1" style={{ letterSpacing: '3px' }}>{roomCode}</span>
        </span>
        <button type="button" className="icon-btn icon-btn-danger" onClick={handleLeave} aria-label="Leave room" title="Leave room">
          <BoxArrowLeft size={18} />
        </button>
      </TopBar>

      <main className="flex-grow-1 py-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="container px-3"
          style={{ maxWidth: '64rem' }}
        >
          <div className="mb-5">
            <h1 className="fw-bold gold-text mb-2" style={{ letterSpacing: '5px', fontSize: 'clamp(1.75rem, 5vw, 2.75rem)' }}>THE SAFEHOUSE</h1>
            <p className="mb-0" style={muted}>
              {missing > 0
                ? `Waiting for ${missing} more ${missing === 1 ? 'player' : 'players'} to reach the minimum of ${MIN_PLAYERS}.`
                : isHost ? 'Your crew is ready. Start whenever you like.' : 'Your crew is ready. Waiting for the host to start.'}
            </p>
          </div>

          <div className="row g-4">
            {/* Players */}
            <div className="col-lg-7 d-flex flex-column gap-4">
              <section className="card glass-panel p-4 rounded-4" aria-labelledby="players-heading">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h2 id="players-heading" className="h6 fw-bold gold-text mb-0" style={{ letterSpacing: '3px' }}>PLAYERS</h2>
                  <span className="small" style={muted}>
                    <span className="gold-text fw-bold">{players.length}</span> / {MAX_PLAYERS}
                  </span>
                </div>

                <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                  <AnimatePresence initial={false}>
                    {players.map((player) => {
                      const isMe = player.userId === userId;
                      return (
                        <motion.li
                          key={player.userId}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="d-flex align-items-center gap-3 p-2 pe-3 rounded-3"
                          style={{ background: isMe ? 'rgba(200, 169, 107, 0.08)' : 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(200, 169, 107, 0.1)' }}
                        >
                          <span className="position-relative" style={{ opacity: player.disconnected ? 0.5 : 1 }}>
                            <Avatar image={player.avatar} name={player.username} size={44} />
                            {player.isHost && (
                              <span className="position-absolute d-flex align-items-center justify-content-center rounded-circle" style={{ bottom: -3, right: -3, width: 18, height: 18, background: 'var(--accent-gold)' }} title="Host">
                                <StarFill size={10} color="black" />
                              </span>
                            )}
                          </span>
                          <span className="flex-grow-1" style={{ minWidth: 0 }}>
                            <span className="d-block fw-semibold text-truncate" style={{ color: 'var(--text-primary)' }}>
                              {player.username}
                              {isMe && <span className="gold-text small ms-2">(you)</span>}
                            </span>
                            {player.disconnected ? (
                              <span className="small d-flex align-items-center" style={{ color: '#ff8a80' }}>
                                <WifiOff size={12} className="me-1" /> Reconnecting…
                              </span>
                            ) : (
                              <span className="small" style={muted}>{player.isHost ? 'Host' : 'Ready'}</span>
                            )}
                          </span>
                          <span className="badge rounded-pill" style={{ border: '1px solid rgba(200, 169, 107, 0.4)', color: 'var(--accent-gold)', fontWeight: 600 }}>
                            LV {player.level ?? 1}
                          </span>
                          {isHost && !isMe && (
                            <button
                              type="button"
                              className="icon-btn icon-btn-danger"
                              style={{ width: 36, height: 36 }}
                              onClick={() => handleKick(player)}
                              aria-label={`Remove ${player.username}`}
                              title="Remove player"
                            >
                              <XLg size={14} />
                            </button>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                  {Array.from({ length: missing }).map((_, index) => (
                    <li
                      key={`empty-${index}`}
                      className="d-flex align-items-center gap-3 p-2 rounded-3"
                      style={{ border: '1px dashed rgba(200, 169, 107, 0.2)', ...muted }}
                    >
                      <span className="d-inline-flex align-items-center justify-content-center rounded-circle" style={{ width: 44, height: 44, border: '1px dashed rgba(200, 169, 107, 0.25)' }}>
                        <PersonPlus size={18} />
                      </span>
                      <span className="small">Waiting for a player…</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card glass-panel p-4 rounded-4" aria-labelledby="invite-heading">
                <h2 id="invite-heading" className="h6 fw-bold gold-text mb-3" style={{ letterSpacing: '3px' }}>INVITE YOUR CREW</h2>
                <p className="small mb-3" style={muted}>Share this frequency code. Friends enter it under “Join a game”.</p>
                <div className="d-flex align-items-center gap-2">
                  <span className="flex-grow-1 text-center py-2 rounded-3 gold-text fw-bold" style={{ background: '#000', border: '1px solid rgba(200, 169, 107, 0.3)', fontSize: '1.6rem', letterSpacing: '8px', fontFamily: 'var(--font-title)' }}>
                    {roomCode}
                  </span>
                  <button type="button" className="icon-btn" onClick={handleCopy} aria-label={copied ? 'Code copied' : 'Copy room code'} title="Copy code" style={{ height: 52, width: 52 }}>
                    {copied ? <ClipboardCheck size={20} /> : <Clipboard size={20} />}
                  </button>
                </div>
                <span className="small d-block mt-2" role="status" style={{ ...muted, minHeight: '1.25rem' }}>{copied ? 'Copied to clipboard.' : ''}</span>
              </section>
            </div>

            {/* Settings + start */}
            <div className="col-lg-5">
              <section className="card glass-panel p-4 rounded-4" aria-labelledby="setup-heading">
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <h2 id="setup-heading" className="h6 fw-bold gold-text mb-0 d-flex align-items-center" style={{ letterSpacing: '3px' }}>
                    <Sliders className="me-2" /> GAME SETTINGS
                  </h2>
                </div>
                <p className="small mb-3" style={muted}>
                  {isHost ? 'Only you can change these. Everyone sees them update live.' : 'Set by the host.'}
                </p>

                <Segmented
                  id="setting-discussion"
                  label="Discussion time"
                  options={DISCUSSION_OPTIONS}
                  value={settings.discussionTime}
                  onChange={updateSetting('discussionTime')}
                  disabled={!isHost}
                />
                <Segmented
                  id="setting-voting"
                  label="Voting time"
                  hint="Voting also ends once everyone has voted."
                  options={VOTING_OPTIONS}
                  value={settings.votingTime}
                  onChange={updateSetting('votingTime')}
                  disabled={!isHost}
                />
                <Segmented
                  id="setting-visibility"
                  label="Votes"
                  hint={settings.voteVisibility === 'public' ? 'Everyone sees who voted for whom.' : 'Only vote totals are shown.'}
                  options={VISIBILITY_OPTIONS}
                  value={settings.voteVisibility}
                  onChange={updateSetting('voteVisibility')}
                  disabled={!isHost}
                />
                <Segmented
                  id="setting-reveal"
                  label="Role on death"
                  hint={settings.revealRoleOnDeath ? "A player's role is announced when they die." : 'Roles stay secret until the game ends.'}
                  options={REVEAL_OPTIONS}
                  value={settings.revealRoleOnDeath}
                  onChange={updateSetting('revealRoleOnDeath')}
                  disabled={!isHost}
                />
                <Segmented
                  id="setting-detective"
                  label="Detective"
                  hint={detectiveHint}
                  options={DETECTIVE_OPTIONS}
                  value={settings.detective}
                  onChange={updateSetting('detective')}
                  disabled={!isHost}
                />

                <ul className="list-unstyled small mb-4 mt-2 pt-3 d-flex flex-column gap-2" style={{ ...muted, borderTop: '1px solid rgba(200, 169, 107, 0.12)' }}>
                  <li className="d-flex justify-content-between"><span>Mafia</span><span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>{mafiaCount}</span></li>
                  <li className="d-flex justify-content-between"><span>Medic</span><span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>1</span></li>
                  {detectiveCount > 0 && (
                    <li className="d-flex justify-content-between"><span>Detective</span><span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>1</span></li>
                  )}
                  <li className="d-flex justify-content-between"><span>Civilians</span><span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>{Math.max(0, players.length - mafiaCount - 1 - detectiveCount)}</span></li>
                </ul>

                {isHost ? (
                  <button
                    type="button"
                    className="btn btn-gold btn-lg w-100 py-3 rounded-3 d-flex align-items-center justify-content-center"
                    disabled={missing > 0}
                    onClick={() => socket.emit('start_game', { roomCode })}
                  >
                    <PlayFill size={22} className="me-2" />
                    {missing > 0 ? `Need ${missing} more` : 'Start the game'}
                  </button>
                ) : (
                  <div className="d-flex align-items-center justify-content-center gap-2 py-3 rounded-3 small" style={{ border: '1px solid rgba(200, 169, 107, 0.2)', ...muted }}>
                    <span className="spinner-border spinner-border-sm gold-text" role="status" aria-hidden="true" />
                    Waiting for the host to start…
                  </div>
                )}
              </section>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Lobby;
