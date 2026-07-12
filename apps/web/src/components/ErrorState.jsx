import Button from './Button';
import './ErrorState.css';

export default function ErrorState({ title = "Oops!", message, onRetry }) {
  return (
    <div className="error-state">
      <div className="error-title">{title}</div>
      {message && <div className="error-message">{message}</div>}
      {onRetry && (
        <Button variant="outline" size="small" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
