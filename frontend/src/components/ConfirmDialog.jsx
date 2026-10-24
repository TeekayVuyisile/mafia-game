import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExclamationTriangleFill, QuestionCircleFill } from 'react-bootstrap-icons';

const TONES = {
  danger: { accent: '#ff8a80', rgb: '179, 58, 58', Icon: ExclamationTriangleFill },
  default: { accent: 'var(--accent-gold)', rgb: '200, 169, 107', Icon: QuestionCircleFill }
};

/**
 * Themed replacement for window.confirm. Cancel is focused first (the safe choice), Escape or a
 * backdrop click cancels, Tab stays inside the dialog, and focus returns to the opener on close.
 */
const ConfirmDialog = ({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', Icon, onConfirm, onCancel }) => {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const palette = TONES[tone] || TONES.default;
  const DialogIcon = Icon || palette.Icon;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1080, background: 'rgba(0, 0, 0, 0.72)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="w-100 rounded-4 p-4 p-sm-5"
            style={{
              maxWidth: '440px',
              background: 'linear-gradient(180deg, #1c1c1c 0%, #121212 100%)',
              border: `1px solid rgba(${palette.rgb}, 0.45)`,
              boxShadow: `0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(${palette.rgb}, 0.08)`
            }}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-3 mb-4"
              style={{ width: 52, height: 52, background: `rgba(${palette.rgb}, 0.12)`, border: `1px solid rgba(${palette.rgb}, 0.4)` }}
              aria-hidden="true"
            >
              <DialogIcon size={24} color={palette.accent} />
            </span>
            <h2 id="confirm-title" className="h4 fw-bold mb-2" style={{ color: palette.accent, letterSpacing: '2px' }}>{title}</h2>
            <p id="confirm-message" className="mb-4" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
            <div className="d-flex flex-column-reverse flex-sm-row gap-2 justify-content-end">
              <button
                ref={cancelRef}
                type="button"
                className="btn rounded-3 px-4"
                style={{ minHeight: 46, border: '1px solid rgba(255, 255, 255, 0.18)', color: 'var(--text-primary)', background: 'transparent' }}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`btn rounded-3 px-4 fw-semibold ${tone === 'danger' ? '' : 'btn-gold'}`}
                style={tone === 'danger'
                  ? { minHeight: 46, background: '#b33a3a', border: '1px solid #b33a3a', color: '#fff' }
                  : { minHeight: 46 }}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
