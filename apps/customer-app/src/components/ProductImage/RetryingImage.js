import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';

// Waits between reloads of a picture that failed to load (about 45s in all).
// A dip in the connection lasts a second or two, so the first retries are
// quick; after the last one the caller gets `failed` and shows its fallback.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000];

// A failed picture used to stay a placeholder until the screen was rebuilt,
// even if the internet was back a second later. This reloads it on its own.
// Put `attempt` in the Image's `key` so each retry starts a fresh load.
export function useImageRetry(uri, onGiveUp) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // True from the first failed load until a retry succeeds, so callers can show a
  // fallback picture meanwhile instead of an empty box.
  const [hadError, setHadError] = useState(false);
  const attemptRef = useRef(0);
  const timerRef = useRef(null);
  const giveUpRef = useRef(onGiveUp);
  giveUpRef.current = onGiveUp;

  useEffect(() => {
    attemptRef.current = 0;
    setAttempt(0);
    setFailed(false);
    setHadError(false);
    return () => clearTimeout(timerRef.current);
  }, [uri]);

  const onLoad = useCallback(() => {
    clearTimeout(timerRef.current);
    setHadError(false);
  }, []);

  const onError = useCallback(() => {
    clearTimeout(timerRef.current);
    setHadError(true);
    if (attemptRef.current >= RETRY_DELAYS_MS.length) {
      setFailed(true);
      giveUpRef.current?.();
      return;
    }
    const delay = RETRY_DELAYS_MS[attemptRef.current];
    attemptRef.current += 1;
    timerRef.current = setTimeout(() => setAttempt(attemptRef.current), delay);
  }, []);

  return { attempt, failed, hadError, onError, onLoad };
}

// expo-image that reloads itself after a failed load. `onGiveUp` runs once
// every retry has failed.
export default function RetryingImage({ uri, onGiveUp, ...imageProps }) {
  const { attempt, onError, onLoad } = useImageRetry(uri, onGiveUp);
  return <Image key={attempt} source={{ uri }} onError={onError} onLoad={onLoad} {...imageProps} />;
}
