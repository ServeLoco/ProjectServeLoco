import { useEffect, useState } from 'react';
import { getRealtimeConnectionState, subscribeRealtimeLifecycle } from '../api/realtimeClient';

/**
 * useRealtimeConnectionState
 * Subscribes to the realtime socket's connect/disconnect events and
 * returns the current connection state. Used by the Reconnecting pill.
 */
export function useRealtimeConnectionState() {
  const [state, setState] = useState(() => getRealtimeConnectionState());

  useEffect(() => {
    // Re-read on subscribe. The initial useState runs during render, and
    // nothing replays lifecycle events, so a 'connected' that lands in the
    // gap between that render and this effect is lost forever — the pill
    // then reads "Reconnecting…" for the rest of the session over a
    // perfectly healthy socket. That gap is normally too small to hit on a
    // real network, but a local API (adb reverse to localhost) connects in
    // a few ms and loses the race almost every launch.
    setState(getRealtimeConnectionState());

    const unsub = subscribeRealtimeLifecycle((event) => {
      // subscribeRealtimeLifecycle strips the 'lifecycle.' prefix; the bare
      // names here are 'connected', 'reconnected', 'disconnected', and
      // 'foreground'.
      const name = event?.eventName;
      if (name === 'connected' || name === 'reconnected') {
        setState({ connected: true, hasSocket: true });
      } else if (name === 'disconnected') {
        setState({ connected: false, hasSocket: true });
      }
    });
    return unsub;
  }, []);

  return state;
}
