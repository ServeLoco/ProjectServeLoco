import { useEffect, useState } from 'react';
import './OfflineBanner.css';

/**
 * OfflineBanner
 * Slim banner that appears at the top of the screen when the app cannot
 * reach the server. Auto-dismisses when connectivity is restored.
 *
 * Props:
 *   visible          - whether to show the banner
 *   message          - banner text (default: "Can't reach the server.")
 *   onRetry          - optional retry callback (shows a "Retry" pill)
 */
function OfflineBanner({ visible, message = "Can't reach the server.", onRetry }) {
  const [shown, setShown] = useState(visible);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (visible) {
      setShown(true);
      setHeight(60); // Full height for animation
    } else {
      // Animate out by setting height to 0 after a delay
      const timer = setTimeout(() => {
        setHeight(0);
        setTimeout(() => setShown(false), 220); // Match transition duration
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!shown) return null;

  return (
    <div
      className="offline-banner"
      style={{ height: `${height}px` }}
      role="alert"
      aria-live="polite"
    >
      <div className="offline-banner-content">
        <div className="offline-dot"></div>
        <div className="offline-message">{message}</div>
        {onRetry && (
          <button className="offline-retry" onClick={onRetry}>Retry</button>
        )}
      </div>
    </div>
  );
}

export default OfflineBanner;