import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Google, Envelope, Lock, Person, ShieldLock } from 'react-bootstrap-icons';
import Notification from './Notification';

const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [notification, setNotification] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: { username } // This username will be picked up by the trigger!
        }
      });

      if (error) {
        setNotification({ message: error.message, type: 'error' });
      } else {
        setNotification({ message: 'Sign up successful! Access the room via login.', type: 'success' });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setNotification({ message: error.message, type: 'error' });
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setNotification(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      setNotification({ message: error.message, type: 'error' });
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--bg-primary)' }}>
      <AnimatePresence>
        {notification && (
          <Notification 
            message={notification.message} 
            type={notification.type} 
            onClose={() => setNotification(null)} 
          />
        )}
      </AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card shadow-lg border-0 glass-panel" 
        style={{ width: '100%', maxWidth: '450px', borderRadius: '25px', border: '1px solid var(--accent-gold)' }}
      >
        <div className="card-body p-5">
          <div className="text-center mb-5">
            <div className="d-inline-block p-4 rounded-circle mb-4" style={{ background: 'rgba(200, 169, 107, 0.1)', border: '2px solid var(--accent-gold)' }}>
              <ShieldLock size={50} className="gold-text" />
            </div>
            <h1 className="h2 mb-2 gold-text" style={{ letterSpacing: '4px' }}>UNDERGROUND</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {isSignUp ? 'Establish your identity' : 'Authenticating access...'}
            </p>
          </div>

          <form onSubmit={handleAuth}>
            {isSignUp && (
              <div className="mb-4">
                <div className="input-group">
                  <span className="input-group-text border-0" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-gold)' }}><Person /></span>
                  <input
                    className="form-control"
                    type="text"
                    placeholder="USERNAME"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}
            <div className="mb-4">
              <div className="input-group">
                <span className="input-group-text border-0" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-gold)' }}><Envelope /></span>
                <input
                  className="form-control"
                  type="email"
                  placeholder="EMAIL ADDRESS"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="mb-5">
              <div className="input-group">
                <span className="input-group-text border-0" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-gold)' }}><Lock /></span>
                <input
                  className="form-control"
                  type="password"
                  placeholder="PASSWORD"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <button className="btn btn-gold btn-lg w-100 mb-4 py-3" disabled={loading}>
              {loading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                isSignUp ? 'ESTABLISH CONTACT' : 'ENTER THE ROOM'
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="small mb-4" style={{ color: 'var(--text-secondary)' }}>
              {isSignUp ? 'Already a member?' : "New recruit?"}
              <button 
                className="btn btn-link btn-sm gold-text text-decoration-none fw-bold ms-2"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? 'LOGIN' : 'SIGN UP'}
              </button>
            </p>
            
            <div className="d-flex align-items-center mb-4">
              <hr className="flex-grow-1" style={{ borderColor: 'rgba(200, 169, 107, 0.2)' }} />
              <span className="mx-3 small" style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>SECURE LOGIN</span>
              <hr className="flex-grow-1" style={{ borderColor: 'rgba(200, 169, 107, 0.2)' }} />
            </div>

            <button 
              className="btn btn-outline-light w-100 d-flex align-items-center justify-content-center py-2 rounded-pill" 
              style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', fontSize: '0.8rem' }}
              onClick={handleGoogleLogin}
            >
              <Google className="me-2" /> CONTINUE WITH GOOGLE
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
