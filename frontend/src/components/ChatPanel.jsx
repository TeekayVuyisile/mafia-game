import { useEffect, useRef, useState } from 'react';
import { SendFill } from 'react-bootstrap-icons';
import Avatar from './Avatar';

const MAX_CHAT_LENGTH = 300;
const muted = { color: 'var(--text-secondary)' };

// Each channel gets its own accent so players never mix up who can read what
const ACCENTS = {
  town: { color: 'var(--accent-gold)', rgb: '200, 169, 107' },
  mafia: { color: '#ff8a80', rgb: '179, 58, 58' },
  ghost: { color: '#a9b8d4', rgb: '143, 163, 192' }
};

const formatTime = (timestamp) =>
  typeof timestamp === 'number'
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : timestamp;

/**
 * One chat channel. `onSend(text)` resolves to the server ack `{ ok, error }`; the input is only
 * cleared once the server confirms, so a failed send never loses what the player typed.
 */
const ChatPanel = ({ id, channel = 'town', title, Icon, note, messages, players, userId, canSend, readOnlyNote, placeholder, emptyText, connected, onSend, height = 300 }) => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const stickToBottom = useRef(true);
  const accent = ACCENTS[channel] || ACCENTS.town;

  // Follow new messages unless the player has scrolled up to read history
  useEffect(() => {
    const box = boxRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const box = boxRef.current;
    if (box) stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    // Socket.io buffers emits while offline and would replay them later, causing duplicates on retry
    if (!connected) return setError('Connection lost. Reconnecting...');

    setSending(true);
    setError(null);
    stickToBottom.current = true;
    const res = await onSend(text);
    setSending(false);
    if (!res?.ok) return setError(res?.error || 'Message rejected.');
    // Keep anything typed while the message was in flight
    setInput(prev => (prev.trim() === text ? '' : prev));
  };

  return (
    <section className="card glass-panel rounded-4 p-4" style={{ borderColor: `rgba(${accent.rgb}, 0.45)` }} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="h6 fw-bold mb-1 d-flex align-items-center" style={{ letterSpacing: '3px', color: accent.color }}>
        {Icon && <Icon className="me-2" />} {title}
      </h2>
      {note && <p className="small mb-3" style={muted}>{note}</p>}
      <div
        ref={boxRef}
        onScroll={handleScroll}
        className={`rounded-3 p-3 mb-3 ${note ? '' : 'mt-2'}`}
        style={{ height, overflowY: 'auto', background: 'rgba(0, 0, 0, 0.35)', border: `1px solid rgba(${accent.rgb}, 0.15)` }}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-center mt-5 mb-0 small" style={muted}>{emptyText}</p>
        )}
        {messages.map((msg) => {
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
                    background: mine ? `rgba(${accent.rgb}, 0.16)` : 'rgba(255,255,255,0.06)',
                    border: mine ? `1px solid rgba(${accent.rgb}, 0.45)` : '1px solid transparent',
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
      {canSend ? (
        <>
          <form onSubmit={handleSubmit} className="d-flex gap-2">
            <label htmlFor={`${id}-input`} className="visually-hidden">Message</label>
            <input
              id={`${id}-input`}
              type="text"
              className="form-control rounded-3 px-3"
              placeholder={connected ? placeholder : 'Reconnecting…'}
              value={input}
              maxLength={MAX_CHAT_LENGTH}
              onChange={(e) => setInput(e.target.value)}
              style={{ background: '#000', minHeight: 48 }}
            />
            <button
              type="submit"
              disabled={sending || !connected || !input.trim()}
              className="btn btn-gold rounded-3 d-flex align-items-center justify-content-center"
              style={{ width: 52, minHeight: 48 }}
              aria-label="Send message"
            >
              {sending ? <span className="spinner-border spinner-border-sm" role="status" /> : <SendFill size={18} />}
            </button>
          </form>
          {error && <small className="d-block mt-2" role="alert" style={{ color: '#ff8a80' }}>{error}</small>}
        </>
      ) : (
        <p className="small text-center mb-0" style={muted}>{readOnlyNote}</p>
      )}
    </section>
  );
};

export default ChatPanel;
