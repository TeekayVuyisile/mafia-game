import { useCallback, useEffect, useRef, useState } from 'react';

const MUTE_KEY = 'mafia-narrator-muted';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
};

// Chrome silently stops utterances that run past ~15s, so speak sentence by sentence
// instead of relying on a pause/resume heartbeat (which breaks speech on Android).
const toChunks = (text) => (text.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean);

const pickVoice = () => {
  const voices = window.speechSynthesis.getVoices();
  return voices.find(v => v.lang?.startsWith('en') && v.localService)
    || voices.find(v => v.lang?.startsWith('en'))
    || null;
};

// Browsers refuse speech until the user has interacted with the page (e.g. after a
// reload-reconnect). `blocked` signals the UI to offer a tap that calls `unlock`.
export function useNarrator() {
  const [muted, setMuted] = useState(readMuted);
  const [blocked, setBlocked] = useState(false);
  const mutedRef = useRef(muted);
  const lastSpoken = useRef('');
  const pending = useRef(null);
  const startTimeout = useRef(null);
  const utterances = useRef([]); // keep references so Chrome doesn't garbage-collect them mid-speech
  const voice = useRef(null);

  useEffect(() => {
    if (!supported) return;
    const loadVoice = () => { voice.current = pickVoice(); };
    loadVoice();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoice);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoice);
      clearTimeout(startTimeout.current);
      window.speechSynthesis.cancel();
      // Whatever was cut off here may be requested again (StrictMode remounts)
      lastSpoken.current = '';
    };
  }, []);

  const play = useCallback((text) => {
    clearTimeout(startTimeout.current);
    window.speechSynthesis.cancel();

    // Give cancel() a moment to flush; Safari drops speak() calls made in the same tick
    startTimeout.current = setTimeout(() => {
      utterances.current = toChunks(text).map(chunk => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = 0.95;
        utterance.lang = 'en-US';
        if (voice.current) utterance.voice = voice.current;
        utterance.onstart = () => setBlocked(false);
        utterance.onerror = (event) => {
          if (event.error === 'not-allowed') {
            pending.current = text;
            setBlocked(true);
          } else if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Narrator error:', event.error);
          }
        };
        return utterance;
      });
      utterances.current.forEach(u => window.speechSynthesis.speak(u));
      // Un-sticks Chrome if the engine was left in a paused state
      window.speechSynthesis.resume();
    }, 120);
  }, []);

  const speak = useCallback((text) => {
    if (!supported || !text || text === lastSpoken.current) return;
    lastSpoken.current = text;
    if (mutedRef.current) return;

    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      pending.current = text;
      setBlocked(true);
      return;
    }
    play(text);
  }, [play]);

  // Must be called from a user gesture (click/tap)
  const unlock = useCallback(() => {
    setBlocked(false);
    const text = pending.current || lastSpoken.current;
    pending.current = null;
    if (supported && text && !mutedRef.current) play(text);
  }, [play]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, String(next));
    } catch {
      // storage unavailable (private mode); the setting just won't persist
    }
    if (!supported) return;
    if (next) {
      clearTimeout(startTimeout.current);
      window.speechSynthesis.cancel();
    } else {
      setBlocked(false);
      pending.current = null;
      if (lastSpoken.current) play(lastSpoken.current);
    }
  }, [play]);

  return { supported, muted, blocked, speak, unlock, toggleMute };
}
