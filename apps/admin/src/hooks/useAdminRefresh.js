import { useEffect, useRef } from 'react';

export function useAdminRefresh(callback) {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);

  useEffect(() => {
    const handler = () => {
      if (typeof cbRef.current === 'function') {
        cbRef.current();
      }
    };
    window.addEventListener('admin:refresh', handler);
    return () => window.removeEventListener('admin:refresh', handler);
  }, []);
}
