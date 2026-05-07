import React from 'react';
import { motion } from 'framer-motion';
import { ShieldLock, PeopleFill, EyeSlashFill, ChatRightDotsFill, CheckCircleFill, ArrowRight } from 'react-bootstrap-icons';

const LandingPage = ({ onEnter }) => {
  return (
    <div className="container-fluid min-vh-100 p-0" style={{ background: 'var(--bg-primary)', overflowX: 'hidden' }}>
      {/* Hero Section */}
      <section className="d-flex align-items-center justify-content-center py-5 position-relative" style={{ minHeight: '80vh' }}>
        <div className="position-absolute top-0 start-0 w-100 h-100" style={{ 
          backgroundImage: 'url("/hero.png")', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center',
          opacity: 0.2,
          filter: 'grayscale(100%)'
        }}></div>
        
        <div className="container position-relative z-1 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <h1 className="display-1 fw-bold gold-text mb-3" style={{ letterSpacing: '15px', textShadow: '0 0 30px rgba(200, 169, 107, 0.4)' }}>
              MAFIA
            </h1>
            <h2 className="h4 gold-text opacity-75 mb-5" style={{ letterSpacing: '5px' }}>THE UNDERGROUND SOCIETY</h2>
            
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: '0 0 30px var(--accent-gold-glow)', color: '#fffff0' }}
              whileTap={{ scale: 0.95 }}
              className="btn btn-gold btn-lg px-5 py-3 rounded-pill fw-bold mb-4"
              onClick={onEnter}
              style={{ fontSize: '1.2rem', letterSpacing: '2px' }}
            >
              ENTER THE UNDERGROUND <ArrowRight className="ms-2" />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Instructions Section */}
      <section className="container py-5">
        <div className="text-center mb-5">
          <h2 className="gold-text mb-4" style={{ letterSpacing: '4px' }}>How to Survive</h2>
          <div className="mx-auto" style={{ width: '100px', height: '2px', background: 'var(--accent-gold)' }}></div>
        </div>

        <div className="row g-5">
          {/* Phase 1 */}
          <div className="col-md-4">
            <motion.div 
              whileHover={{ y: -10 }}
              className="glass-panel p-5 h-100 gold-border text-center"
            >
              <div className="mb-4 d-inline-block p-3 rounded-circle" style={{ background: 'rgba(200, 169, 107, 0.1)' }}>
                <EyeSlashFill size={40} className="gold-text" />
              </div>
              <h4 className="gold-text mb-3">Night Falls</h4>
              <p className="text-secondary small">The city sleeps. The <span className="text-danger fw-bold">Mafia</span> selects a target to eliminate. The <span className="text-success fw-bold">Medic</span> chooses one person to protect from death.</p>
            </motion.div>
          </div>

          {/* Phase 2 */}
          <div className="col-md-4">
            <motion.div 
              whileHover={{ y: -10 }}
              className="glass-panel p-5 h-100 gold-border text-center"
            >
              <div className="mb-4 d-inline-block p-3 rounded-circle" style={{ background: 'rgba(200, 169, 107, 0.1)' }}>
                <ChatRightDotsFill size={40} className="gold-text" />
              </div>
              <h4 className="gold-text mb-3">Day Breaks</h4>
              <p className="text-secondary small">The sun rises and casualties are revealed. Survivors engage in a <span className="gold-text fw-bold">Discussion</span> to deduce who the hidden Mafia members are.</p>
            </motion.div>
          </div>

          {/* Phase 3 */}
          <div className="col-md-4">
            <motion.div 
              whileHover={{ y: -10 }}
              className="glass-panel p-5 h-100 gold-border text-center"
            >
              <div className="mb-4 d-inline-block p-3 rounded-circle" style={{ background: 'rgba(200, 169, 107, 0.1)' }}>
                <CheckCircleFill size={40} className="gold-text" />
              </div>
              <h4 className="gold-text mb-3">The Trial</h4>
              <p className="text-secondary small">The town casts their <span className="gold-text fw-bold">Votes</span>. The person with the most suspicion is lynched. Choose wisely; killing an innocent civilian brings you closer to defeat.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Role Cards Section */}
      <section className="py-5" style={{ background: 'rgba(200, 169, 107, 0.03)' }}>
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="gold-text mb-4" style={{ letterSpacing: '4px' }}>The Players</h2>
          </div>
          
          <div className="row justify-content-center g-4">
            <div className="col-md-3">
              <div className="text-center">
                <img src="/mafia.png" alt="Mafia" style={{ width: '80px', marginBottom: '20px', filter: 'drop-shadow(0 0 10px rgba(139, 0, 0, 0.5))' }} />
                <h5 className="text-danger fw-bold">MAFIA</h5>
                <p className="text-secondary small px-3">Blends in with the crowd. Kills one person every night. Wins if they equal or outnumber the town.</p>
              </div>
            </div>
            <div className="col-md-3">
              <div className="text-center">
                <img src="/medic.png" alt="Medic" style={{ width: '80px', marginBottom: '20px', filter: 'drop-shadow(0 0 10px rgba(46, 139, 87, 0.5))' }} />
                <h5 className="text-success fw-bold">MEDIC</h5>
                <p className="text-secondary small px-3">The guardian. Can save one person (including themselves) from a Mafia hit each night.</p>
              </div>
            </div>
            <div className="col-md-3">
              <div className="text-center">
                <img src="/civilian.png" alt="Civilian" style={{ width: '80px', marginBottom: '20px', filter: 'drop-shadow(0 0 10px rgba(207, 198, 184, 0.5))' }} />
                <h5 style={{ color: 'var(--role-civilian)', fontWeight: 'bold' }}>CIVILIAN</h5>
                <p className="text-secondary small px-3">The majority. Must use logic and social cues to find the Mafia before it's too late.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="container py-5 text-center">
        <div className="glass-panel p-5 gold-border pulse-gold">
          <h2 className="gold-text mb-4">Ready to Begin?</h2>
          <p className="text-secondary mb-5">Join 4-10 players in a game of deception and survival.</p>
          <button className="btn btn-gold btn-lg px-5 py-3 rounded-pill fw-bold" onClick={onEnter}>
            JOIN THE SESSION
          </button>
        </div>
      </section>
      
      <footer className="text-center py-4 border-top border-secondary opacity-25">
        <small className="gold-text">&copy; 2026 THE UNDERGROUND SOCIETY. ALL RIGHTS RESERVED.</small>
      </footer>
    </div>
  );
};

export default LandingPage;
