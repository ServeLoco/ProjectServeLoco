import React from 'react';
import './MessageBanner.css';

export default function MessageBanner({ type = 'info', message, onDismiss }) {
  if (!message) return null;
  return (
    <div className={`message-banner message-banner--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="message-banner__text">{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="message-banner__close"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          ✕
        </button>
      )}
    </div>
  );
}
