import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, TrophyFill, BarChartFill, Trash3Fill, CheckCircleFill, PersonCircle } from 'react-bootstrap-icons';
import { authClient } from '../authClient';
import { AVATAR_PRESETS, presetValue } from '../avatars';
import Avatar from './Avatar';
import Notification from './Notification';

const sectionTitle = { letterSpacing: '3px', fontSize: '0.85rem' };
const muted = { color: 'var(--text-secondary)' };

const fetchJson = async (url) => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

const StatTile = ({ label, value }) => (
  <div className="col-6 col-md-4">
    <div className="glass-panel rounded-4 p-3 h-100 text-center">
      <div className="fs-3 fw-bold gold-text" style={{ fontFamily: 'var(--font-title)' }}>{value}</div>
      <div className="small text-uppercase" style={{ ...muted, letterSpacing: '1px', fontSize: '0.7rem' }}>{label}</div>
    </div>
  </div>
);

const Settings = ({ user, onClose }) => {
  const [notification, setNotification] = useState(null);
  const [name, setName] = useState(user.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([fetchJson('/api/me/stats'), fetchJson('/api/leaderboard')])
      .then(([myStats, board]) => {
        setStats(myStats);
        setLeaderboard(board);
      })
      .catch(() => setLoadError('Could not load your progress. Try again shortly.'));

    // Email/password users confirm deletion with their password; Google users with a fresh sign-in
    authClient.listAccounts()
      .then(({ data }) => setHasPassword(Boolean(data?.some(a => a.providerId === 'credential'))))
      .catch(() => setHasPassword(false));
  }, []);

  const saveProfile = async (changes, successMessage) => {
    setSavingProfile(true);
    const { error } = await authClient.updateUser(changes);
    setSavingProfile(false);
    if (error) setNotification({ message: error.message || 'Could not update your profile', type: 'error' });
    else setNotification({ message: successMessage, type: 'success' });
  };

  const handleSaveName = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNotification({ message: 'Username cannot be empty', type: 'error' });
    if (trimmed === user.name) return;
    saveProfile({ name: trimmed }, 'Codename updated');
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    setDeleting(true);
    const { error } = await authClient.deleteUser(hasPassword ? { password: deletePassword } : {});
    if (error) {
      setDeleting(false);
      const message = error.code === 'SESSION_EXPIRED'
        ? 'For your security, sign out and sign back in, then delete your account.'
        : error.message || 'Could not delete your account';
      return setNotification({ message, type: 'error' });
    }
    localStorage.removeItem('mafia-room-code');
    window.location.reload();
  };

  const winRate = stats && stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  const levelProgress = stats ? Math.round((stats.xpIntoLevel / stats.xpPerLevel) * 100) : 0;

  return (
    <div className="container-fluid min-vh-100 py-5 px-3" style={{ background: 'var(--bg-primary)' }}>
      <AnimatePresence>
        {notification && (
          <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto" style={{ maxWidth: '860px' }}>
        <div className="d-flex align-items-center justify-content-between mb-5">
          <button className="btn btn-link gold-text text-decoration-none fw-bold p-0" style={{ letterSpacing: '2px', fontSize: '0.8rem' }} onClick={onClose}>
            <ArrowLeft className="me-2" /> COMMAND CENTER
          </button>
          <h1 className="h3 mb-0 gold-text" style={{ letterSpacing: '6px' }}>DOSSIER</h1>
        </div>

        {/* Profile */}
        <section className="card glass-panel gold-border p-4 p-md-5 mb-4" style={{ borderRadius: '25px' }}>
          <h2 className="gold-text mb-4" style={sectionTitle}><PersonCircle className="me-2" /> IDENTITY</h2>
          <div className="d-flex flex-column flex-md-row align-items-center gap-4 mb-4">
            <Avatar image={user.image} name={user.name} size={96} />
            <form onSubmit={handleSaveName} className="flex-grow-1 w-100">
              <label htmlFor="codename" className="small mb-2" style={{ ...muted, letterSpacing: '1px' }}>CODENAME</label>
              <div className="input-group">
                <input id="codename" className="form-control" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
                <button className="btn btn-gold px-4" disabled={savingProfile || !name.trim() || name.trim() === user.name}>
                  {savingProfile ? <span className="spinner-border spinner-border-sm" /> : 'SAVE'}
                </button>
              </div>
              <div className="small mt-2" style={muted}>{user.email}</div>
            </form>
          </div>

          <div className="small mb-3" style={{ ...muted, letterSpacing: '1px' }}>CHOOSE YOUR AVATAR</div>
          <div className="d-flex flex-wrap gap-3">
            {AVATAR_PRESETS.map(preset => {
              const value = presetValue(preset.id);
              const selected = user.image === value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={savingProfile}
                  onClick={() => !selected && saveProfile({ image: value }, 'Avatar updated')}
                  className="btn p-1 rounded-circle position-relative"
                  style={{ border: selected ? '2px solid var(--accent-gold)' : '2px solid transparent' }}
                  aria-label={`Use ${preset.id} avatar`}
                  aria-pressed={selected}
                >
                  <Avatar image={value} size={52} />
                  {selected && <CheckCircleFill className="position-absolute gold-text" style={{ bottom: 0, right: 0 }} size={16} />}
                </button>
              );
            })}
            <button
              type="button"
              disabled={savingProfile || !user.image}
              onClick={() => saveProfile({ image: null }, 'Avatar reset to initials')}
              className="btn p-1 rounded-circle"
              style={{ border: !user.image ? '2px solid var(--accent-gold)' : '2px solid transparent' }}
              aria-label="Use initials"
              aria-pressed={!user.image}
            >
              <Avatar image={null} name={user.name} size={52} />
            </button>
          </div>
        </section>

        {/* Progress */}
        <section className="card glass-panel gold-border p-4 p-md-5 mb-4" style={{ borderRadius: '25px' }}>
          <h2 className="gold-text mb-4" style={sectionTitle}><BarChartFill className="me-2" /> PROGRESS</h2>
          {loadError && <p className="mb-0" style={{ color: 'var(--role-mafia)' }}>{loadError}</p>}
          {!stats && !loadError && <div className="spinner-border gold-text" role="status" />}
          {stats && (
            <>
              <div className="d-flex justify-content-between align-items-end mb-2">
                <div>
                  <div className="small" style={{ ...muted, letterSpacing: '1px' }}>RANK</div>
                  <div className="h3 mb-0 gold-text" style={{ letterSpacing: '3px' }}>{stats.rank.toUpperCase()}</div>
                </div>
                <div className="text-end">
                  <div className="small" style={{ ...muted, letterSpacing: '1px' }}>LEVEL</div>
                  <div className="h3 mb-0 gold-text" style={{ fontFamily: 'var(--font-title)' }}>{stats.level}</div>
                </div>
              </div>
              <div className="progress mb-2" style={{ height: '10px', background: 'rgba(255,255,255,0.06)' }} role="progressbar" aria-valuenow={levelProgress} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-bar" style={{ width: `${levelProgress}%`, background: 'var(--accent-gold)' }} />
              </div>
              <div className="d-flex justify-content-between small mb-4" style={muted}>
                <span>{stats.xpIntoLevel} / {stats.xpPerLevel} XP to level {stats.level + 1}</span>
                {stats.nextRank && <span>{stats.nextRank.title} at level {stats.nextRank.level}</span>}
              </div>
              <div className="row g-3">
                <StatTile label="Games played" value={stats.gamesPlayed} />
                <StatTile label="Wins" value={stats.wins} />
                <StatTile label="Win rate" value={`${winRate}%`} />
                <StatTile label="Wins as Mafia" value={stats.mafiaWins} />
                <StatTile label="Wins as Civilian" value={stats.civilianWins} />
                <StatTile label="Wins as Medic" value={stats.medicWins} />
                <StatTile label="Wins as Detective" value={stats.detectiveWins ?? 0} />
              </div>
              <p className="small mt-4 mb-0" style={muted}>
                Every finished game earns 20 XP, plus 80 for a win and 20 for surviving to the end.
              </p>
            </>
          )}
        </section>

        {/* Leaderboard */}
        <section className="card glass-panel gold-border p-4 p-md-5 mb-4" style={{ borderRadius: '25px' }}>
          <h2 className="gold-text mb-4" style={sectionTitle}><TrophyFill className="me-2" /> THE FAMILY'S FINEST</h2>
          {leaderboard && leaderboard.length === 0 && (
            <p className="mb-0" style={muted}>No finished games yet. Be the first name on the board.</p>
          )}
          {leaderboard && leaderboard.length > 0 && (
            <ol className="list-unstyled mb-0">
              {leaderboard.map((entry, index) => (
                <li
                  key={entry.userId}
                  className="d-flex align-items-center gap-3 py-2 px-3 rounded-4 mb-2"
                  style={{ background: entry.userId === user.id ? 'rgba(200, 169, 107, 0.1)' : 'transparent' }}
                >
                  <span className="gold-text fw-bold text-end" style={{ width: '1.5rem', fontFamily: 'var(--font-title)' }}>{index + 1}</span>
                  <Avatar image={entry.image} name={entry.name} size={36} />
                  <div className="flex-grow-1 text-truncate">
                    <div className="fw-bold text-truncate">{entry.name}{entry.userId === user.id && <span className="gold-text ms-2 small">(YOU)</span>}</div>
                    <div className="small" style={muted}>{entry.rank} · {entry.wins} wins</div>
                  </div>
                  <span className="badge rounded-pill" style={{ border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)' }}>LV {entry.level}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Danger zone */}
        <section className="card glass-panel p-4 p-md-5" style={{ borderRadius: '25px', border: '1px solid var(--role-mafia)' }}>
          <h2 className="mb-3" style={{ ...sectionTitle, color: '#ff8a80' }}><Trash3Fill className="me-2" /> DELETE ACCOUNT</h2>
          <p className="small" style={muted}>
            This permanently erases your account, sign-in methods and all progress. It cannot be undone.
          </p>
          {!confirmingDelete ? (
            <button
              className="btn rounded-pill px-4"
              style={{ background: 'transparent', border: '1px solid var(--role-mafia)', color: '#ff8a80', width: 'auto' }}
              onClick={() => setConfirmingDelete(true)}
            >
              DELETE MY ACCOUNT
            </button>
          ) : (
            <form onSubmit={handleDelete} className="mt-2" style={{ maxWidth: '420px' }}>
              <label htmlFor="delete-confirm" className="small mb-2" style={muted}>Type DELETE to confirm</label>
              <input id="delete-confirm" className="form-control mb-3" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
              {hasPassword && (
                <>
                  <label htmlFor="delete-password" className="small mb-2" style={muted}>Your password</label>
                  <input id="delete-password" type="password" className="form-control mb-3" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
                </>
              )}
              <div className="d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-danger rounded-pill px-4"
                  disabled={deleting || deleteText !== 'DELETE' || (hasPassword && !deletePassword)}
                >
                  {deleting ? <span className="spinner-border spinner-border-sm" /> : 'PERMANENTLY DELETE'}
                </button>
                <button type="button" className="btn btn-link text-secondary text-decoration-none" onClick={() => { setConfirmingDelete(false); setDeleteText(''); setDeletePassword(''); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </motion.div>
    </div>
  );
};

export default Settings;
