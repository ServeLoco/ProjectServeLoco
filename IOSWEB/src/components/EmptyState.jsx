import React from 'react';
import './EmptyState.css';

export default function EmptyState({ title, message, icon, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon-wrapper">{icon}</div>}
      <div className="empty-title">{title}</div>
      {message && <div className="empty-message">{message}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
