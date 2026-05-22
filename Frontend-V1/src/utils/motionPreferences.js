import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) {
          setReducedMotion(Boolean(value));
        }
      })
      .catch(() => {
        if (mounted) {
          setReducedMotion(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedMotion;
}

export { useReducedMotion };
