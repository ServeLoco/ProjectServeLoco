
import './EmptyState.css';

export default function EmptyState({ title, message, icon }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon-wrapper">{icon}</div>}
      {title && <div className="empty-title">{title}</div>}
      {message && <div className="empty-message">{message}</div>}
    </div>
  );
}
