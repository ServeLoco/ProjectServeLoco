import { useState, useEffect } from 'react';
import { isIOS, isStandalone } from '../utils/deviceDetect';
import './AddToHomePrompt.css';

export default function AddToHomePrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Only show on iOS if not already installed, and not previously dismissed
    if (isIOS() && !isStandalone()) {
      const dismissed = localStorage.getItem('ath-dismissed');
      if (!dismissed) {
        // slight delay so it doesn't pop up immediately
        const timer = setTimeout(() => {
          if (mounted) setShow(true);
        }, 3000);
        return () => {
          mounted = false;
          clearTimeout(timer);
        };
      }
    }
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // If the user actually installs the PWA later, clear the dismiss flag
    // so a future reinstall (rare) re-shows the prompt.
    const onAppInstalled = () => localStorage.removeItem('ath-dismissed');
    window.addEventListener('appinstalled', onAppInstalled);
    return () => window.removeEventListener('appinstalled', onAppInstalled);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('ath-dismissed', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="add-to-home-prompt">
      <div className="ath-header">
        <span className="ath-title">Install ServeLoco App</span>
        <button className="ath-close" onClick={handleDismiss} aria-label="Dismiss">&times;</button>
      </div>
      <div className="ath-content">
        <img src="/icons/icon-192.png" alt="App Icon" className="ath-icon" />
        <div className="ath-instructions">
          Install this application on your home screen for quick and easy access.
          <br /><br />
          Tap <strong>Share</strong> icon below and then tap <strong>Add to Home Screen</strong>.
        </div>
      </div>
    </div>
  );
}
