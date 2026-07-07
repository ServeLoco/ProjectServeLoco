import { useEffect, useState } from 'react';

/**
 * useOnlineStatus
 * Hook to track online/offline status.
 *
 * Returns:
 *   online - boolean
 *   retry - function to force a retry
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const retry = () => setRetryTrigger(prev => prev + 1);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Optional: Add periodic checks for more robust detection
  useEffect(() => {
    if (online) return;
    
    const interval = setInterval(() => {
      // Simple HEAD request to check connectivity
      fetch('https://httpbin.org/head', { method: 'HEAD', cache: 'no-store' })
        .then(() => setOnline(true))
        .catch(() => setOnline(false));
    }, 15000); // Check every 15 seconds when offline
    
    return () => clearInterval(interval);
  }, [online, retryTrigger]);

  return { online, retry };
}