import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExclamationTriangleFill, InfoCircleFill, CheckCircleFill } from 'react-bootstrap-icons';

const Notification = ({ message, type = 'error', onClose }) => {
  if (!message) return null;

  const config = {
    error: {
      icon: <ExclamationTriangleFill className="text-danger me-3" size={24} />,
      title: 'ERROR',
      border: 'var(--role-mafia)',
      glow: 'rgba(139, 0, 0, 0.3)'
    },
    info: {
      icon: <InfoCircleFill className="gold-text me-3" size={24} />,
      title: 'INTEL',
      border: 'var(--accent-gold)',
      glow: 'rgba(200, 169, 107, 0.3)'
    },
    success: {
      icon: <CheckCircleFill className="text-success me-3" size={24} />,
      title: 'CONFIRMED',
      border: 'var(--role-medic)',
      glow: 'rgba(46, 139, 87, 0.3)'
    }
  };

  const { icon, title, border, glow } = config[type] || config.error;

  return (
    <div 
      className="position-fixed top-0 start-50 translate-middle-x mt-4 z-3" 
      style={{ width: '90%', maxWidth: '400px' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className="glass-panel p-3 shadow-lg"
        style={{ 
          border: `1px solid ${border}`,
          boxShadow: `0 0 20px ${glow}`,
          borderRadius: '15px'
        }}
      >
        <div className="d-flex align-items-center">
          {icon}
          <div className="flex-grow-1">
            <div className="fw-bold small mb-1" style={{ color: border, letterSpacing: '2px', fontFamily: 'var(--font-title)' }}>
              {title}
            </div>
            <div className="text-white small" style={{ letterSpacing: '0.5px' }}>
              {message}
            </div>
          </div>
          <button 
            className="btn btn-link text-secondary p-0 ms-3 text-decoration-none" 
            onClick={onClose}
            style={{ fontSize: '1.2rem', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Notification;
