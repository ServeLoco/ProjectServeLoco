import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';

export default function NotFoundScreen() {
  const navigate = useNavigate();
  return (
    <div
      className="screen-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '32px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--text-primary)' }}>404</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
        Page not found
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320 }}>
        The page you're looking for doesn't exist or has been moved.
      </div>
      <Button onClick={() => navigate('/', { replace: true })}>Back to Home</Button>
    </div>
  );
}
